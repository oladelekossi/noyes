import test from "node:test";
import assert from "node:assert/strict";
import { load, fakeClock } from "./load.mjs";

// A fake page for feedback.js. Everything feedback.js knows about X arrives
// through `x`; everything it does is recorded in `log`.
function setup({ forYou = true } = {}) {
  const clock = fakeClock();
  const log = [];
  const page = { forYou, overlay: false, menus: [], undo: [] };
  const menu = ({ name, item = true }) => ({
    name,
    visible: true,
    item: item ? { click: () => log.push(["feedback", name]) } : null,
  });
  const post = ({ id }) => ({
    id,
    isConnected: true,
    caret: { click: () => log.push(["caret", id]) },
    like: { click: () => log.push(["like", id]) },
    cell: { name: `cell-${id}` },
  });
  const x = {
    timing: { menuTimeout: 1600, pollInterval: 40, restoreTimeout: 1500 },
    onForYou: () => page.forYou,
    overlayOpen: () => page.overlay,
    postId: ({ post }) => (post.isConnected ? post.id : undefined),
    caret: ({ post }) => post.caret ?? null,
    likeControl: ({ post }) => post.like ?? null,
    likeState: ({ post }) => post.likeState ?? "like",
    cell: ({ post }) => post.cell,
    menus: () => [...page.menus],
    visible: (element) => element.visible !== false,
    feedbackItem: ({ menu }) => menu.item ?? undefined,
    menuAt: ({ element }) => element?.menu ?? null,
    closeMenu: ({ menu }) => menu && log.push(["close", menu.name]),
    undoControls: ({ key }) =>
      page.undo.map((name) => ({ click: () => log.push(["undo", key, name]) })),
  };
  const ui = {
    notify: ({ message }) => log.push(["notice", message]),
    clearNotice: () => log.push(["clearNotice"]),
  };
  let selected = null;
  const items = [];
  const feed = {
    read: () => items,
    suppress: ({ key }) => log.push(["suppress", key]),
    release: ({ post }) => log.push(["release", post.id]),
  };
  const selection = {
    get: () => selected,
    select: ({ item, key = item?.key }) => {
      selected = key;
      log.push(["select", key]);
    },
    clear: () => {
      selected = null;
      log.push(["clear"]);
    },
  };
  const wheel = load({
    files: ["feedback.js"],
    globals: {
      __wheel: { x, ui, feed, selection },
      document: {},
      performance: clock.performance,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    },
  });
  const feedPosts = ["101", "102", "103"].map((id) => post({ id }));
  for (const target of feedPosts)
    items.push({ key: target.id, target, head: target, articles: [target] });
  const dismiss = (index = 1) =>
    wheel.feedback.dismiss({ item: items[index], items });
  const entries = (kind) => log.filter(([type]) => type === kind);
  return {
    clock,
    log,
    page,
    menu,
    items,
    posts: feedPosts,
    feedback: wheel.feedback,
    dismiss,
    entries,
    select: (key) => (selected = key),
  };
}

// --- Transitions -----------------------------------------------------------

test("idle → unavailable: no caret skips with the notice", async () => {
  const t = setup();
  t.posts[1].caret = null;
  assert.equal(await t.dismiss(), "unavailable");
  assert.deepEqual(t.entries("notice"), [
    ["notice", "Skipped — feedback unavailable; nothing sent."],
  ]);
  assert.equal(t.feedback.pending(), false);
  assert.deepEqual(t.entries("select"), [["select", "103"]]);
});

for (const [name, arrange] of [
  ["off For You", (t) => (t.page.forYou = false)],
  ["with an overlay open", (t) => (t.page.overlay = true)],
  ["while another operation is pending", (t) => void t.dismiss(0)],
])
  test(`idle → idle: start ${name} does nothing`, async () => {
    const t = setup();
    arrange(t);
    const before = t.entries("caret").length;
    assert.equal(await t.dismiss(), undefined);
    assert.equal(t.entries("caret").length, before);
    assert.deepEqual(t.entries("notice"), []);
  });

test("opening → locating → dispatched: sends exactly one feedback", async () => {
  const t = setup();
  const done = t.dismiss();
  assert.equal(t.feedback.state(), "opening");
  assert.deepEqual(t.entries("caret"), [["caret", "102"]]);
  const menu = t.menu({ name: "m", item: false });
  t.page.menus.push(menu);
  await t.clock.tick(40);
  assert.equal(t.feedback.state(), "locating");
  menu.item = { click: () => t.log.push(["feedback", "m"]) };
  await t.clock.tick(40);
  assert.equal(await done, "sent");
  assert.equal(t.feedback.state(), "idle");
  assert.deepEqual(t.entries("feedback"), [["feedback", "m"]]);
  assert.deepEqual(t.entries("suppress"), [["suppress", "102"]]);
  assert.deepEqual(t.entries("release"), []);
  assert.deepEqual(t.entries("close"), []);
  // Moves to the captured next neighbor.
  assert.deepEqual(t.entries("select").at(-1), ["select", "103"]);
});

test("a menu open before the caret click is never captured", async () => {
  const t = setup();
  t.page.menus.push(t.menu({ name: "user" }));
  const done = t.dismiss();
  await t.clock.tick(1600);
  assert.equal(await done, "unavailable");
  assert.deepEqual(t.entries("feedback"), []);
  assert.deepEqual(t.entries("close"), []);
});

test("opening → unavailable: timeout on an unchanged post", async () => {
  const t = setup();
  const done = t.dismiss();
  await t.clock.tick(1600);
  assert.equal(await done, "unavailable");
  assert.deepEqual(t.entries("notice"), [
    ["notice", "Skipped — feedback unavailable; nothing sent."],
  ]);
  assert.deepEqual(t.entries("release"), [["release", "102"]]);
});

test("locating → unavailable: timeout closes the captured menu", async () => {
  const t = setup();
  const done = t.dismiss();
  t.page.menus.push(t.menu({ name: "m", item: false }));
  await t.clock.tick(40);
  await t.clock.tick(1600);
  assert.equal(await done, "unavailable");
  assert.deepEqual(t.entries("close"), [["close", "m"]]);
  assert.equal(t.entries("notice").length, 1);
});

for (const [name, change] of [
  ["post ID changed", (t) => (t.posts[1].id = "999")],
  ["post disconnected", (t) => (t.posts[1].isConnected = false)],
  ["left For You", (t) => (t.page.forYou = false)],
])
  test(`opening → cancelled: ${name}, no notice`, async () => {
    const t = setup();
    const done = t.dismiss();
    change(t);
    await t.clock.tick(40);
    await t.clock.tick(1600);
    assert.equal(await done, undefined);
    assert.deepEqual(t.entries("notice"), []);
    assert.deepEqual(t.entries("feedback"), []);
    assert.deepEqual(t.entries("release"), [["release", t.posts[1].id]]);
  });

test("cancelled on a changed post still closes a late menu", async () => {
  const t = setup();
  const done = t.dismiss();
  t.posts[1].id = "999";
  await t.clock.tick(40);
  assert.equal(t.feedback.state(), "cancelled");
  t.page.menus.push(t.menu({ name: "late" }));
  await t.clock.tick(40);
  assert.equal(await done, undefined);
  assert.deepEqual(t.entries("close"), [["close", "late"]]);
});

test("locating → cancelled: captured menu hidden", async () => {
  const t = setup();
  const done = t.dismiss();
  const menu = t.menu({ name: "m", item: false });
  t.page.menus.push(menu);
  await t.clock.tick(40);
  menu.visible = false;
  await t.clock.tick(40);
  assert.equal(await done, undefined);
  assert.deepEqual(t.entries("feedback"), []);
});

test("pending → cancelled: interrupt closes the captured menu", async () => {
  const t = setup();
  const done = t.dismiss();
  t.page.menus.push(t.menu({ name: "m", item: false }));
  await t.clock.tick(40);
  t.feedback.interrupt({ source: "shortcut" });
  assert.deepEqual(t.entries("close"), [["close", "m"]]);
  await t.clock.tick(40);
  assert.equal(await done, undefined);
  assert.equal(t.feedback.pending(), false);
});

test("cancelled → idle at the original deadline when no menu arrives", async () => {
  const t = setup();
  const done = t.dismiss();
  await t.clock.tick(400);
  t.feedback.interrupt({ source: "shortcut" });
  await t.clock.tick(1199);
  assert.equal(t.feedback.pending(), true);
  await t.clock.tick(1);
  await t.clock.tick(40);
  assert.equal(await done, undefined);
  assert.equal(t.feedback.pending(), false);
  assert.deepEqual(t.entries("release"), [["release", "102"]]);
  // A menu after the deadline is not wheel's to close.
  t.page.menus.push(t.menu({ name: "after" }));
  await t.clock.tick(40);
  assert.deepEqual(t.entries("close"), []);
});

// --- Interrupt sources -------------------------------------------------------

for (const [source, closesLate] of [
  ["shortcut", true],
  ["escape", true],
  ["wheel", true],
  ["touch", true],
  ["key", false],
  ["pointer", false],
])
  test(`interrupt source ${source}: ${closesLate ? "closes" : "leaves"} a late menu`, async () => {
    const t = setup();
    const done = t.dismiss();
    await t.clock.tick(40);
    t.feedback.interrupt({ source, event: { target: {} } });
    await t.clock.tick(40);
    t.page.menus.push(t.menu({ name: "late" }));
    await t.clock.tick(80);
    assert.equal(await done, undefined);
    assert.deepEqual(t.entries("close"), closesLate ? [["close", "late"]] : []);
  });

test("interrupt source menuInput: the user takes the captured menu", async () => {
  const t = setup();
  const done = t.dismiss();
  const menu = t.menu({ name: "m", item: false });
  t.page.menus.push(menu);
  await t.clock.tick(40);
  t.feedback.interrupt({ source: "pointer", event: { target: { menu } } });
  await t.clock.tick(80);
  assert.equal(await done, undefined);
  assert.deepEqual(t.entries("close"), []);
});

test("interrupt source menuInput before capture: a later menu is the user's", async () => {
  const t = setup();
  const done = t.dismiss();
  const menu = t.menu({ name: "m" });
  t.feedback.interrupt({ source: "wheel", event: { target: { menu } } });
  t.page.menus.push(menu);
  await t.clock.tick(80);
  assert.equal(await done, undefined);
  assert.deepEqual(t.entries("close"), []);
  assert.deepEqual(t.entries("feedback"), []);
});

test("a later key interrupt revokes late-menu ownership", async () => {
  const t = setup();
  const done = t.dismiss();
  t.feedback.interrupt({ source: "shortcut" });
  await t.clock.tick(40);
  t.feedback.interrupt({ source: "key", event: { target: {} } });
  t.page.menus.push(t.menu({ name: "late" }));
  await t.clock.tick(80);
  assert.equal(await done, undefined);
  assert.deepEqual(t.entries("close"), []);
});

test("interrupt with nothing pending is a no-op", () => {
  const t = setup();
  t.feedback.interrupt({ source: "key" });
  assert.deepEqual(t.log, []);
});

// --- Invariants ----------------------------------------------------------------

test("invariant: at most one operation exists", async () => {
  const t = setup();
  const first = t.dismiss(1);
  assert.equal(await t.dismiss(2), undefined);
  assert.deepEqual(t.entries("caret"), [["caret", "102"]]);
  t.feedback.interrupt({ source: "key" });
  await t.clock.tick(40);
  await first;
});

test("invariant: a dismissal is recorded only after a click", async () => {
  const t = setup();
  t.feedback.undo();
  const done = t.dismiss();
  t.feedback.interrupt({ source: "key" });
  await t.clock.tick(40);
  await done;
  t.page.undo = ["native"];
  t.feedback.undo();
  assert.deepEqual(t.entries("notice"), [
    ["notice", "Undo unavailable."],
    ["notice", "Undo unavailable."],
  ]);
  assert.deepEqual(t.entries("undo"), []);
});

test("invariant: undo after a sent dismissal clicks the one native control", async () => {
  const t = setup();
  const done = t.dismiss();
  t.page.menus.push(t.menu({ name: "m" }));
  await t.clock.tick(40);
  assert.equal(await done, "sent");
  t.page.undo = ["native"];
  t.feedback.undo();
  assert.deepEqual(t.entries("undo"), [["undo", "102", "native"]]);
  assert.deepEqual(t.entries("clearNotice"), [["clearNotice"]]);
  assert.deepEqual(t.entries("release"), [["release", "102"]]);
  assert.deepEqual(t.entries("select").at(-1), ["select", "102"]);
  // Only once.
  t.feedback.undo();
  assert.deepEqual(t.entries("undo").length, 1);
});

test("invariant: undo refuses ambiguous native controls", async () => {
  const t = setup();
  const done = t.dismiss();
  t.page.menus.push(t.menu({ name: "m" }));
  await t.clock.tick(40);
  await done;
  t.page.undo = ["a", "b"];
  t.feedback.undo();
  assert.deepEqual(t.entries("undo"), []);
  assert.deepEqual(t.entries("notice"), [["notice", "Undo unavailable."]]);
});

test("invariant: suppression is released on every non-dispatched exit", async () => {
  for (const finish of [
    async (t) => t.clock.tick(1600), // unavailable
    async (t) => {
      t.feedback.interrupt({ source: "key" });
      await t.clock.tick(40);
    }, // cancelled
  ]) {
    const t = setup();
    const done = t.dismiss();
    await finish(t);
    await done;
    assert.deepEqual(t.entries("release"), [["release", "102"]]);
    assert.deepEqual(t.entries("suppress"), []);
  }
});

test("selection that moved during the operation is left alone", async () => {
  const t = setup();
  const done = t.dismiss();
  t.select("101");
  t.page.menus.push(t.menu({ name: "m" }));
  await t.clock.tick(40);
  assert.equal(await done, "sent");
  assert.deepEqual(t.entries("select"), []);
});

test("like clicks once per cooldown and advances", async () => {
  const t = setup();
  t.feedback.like({ item: t.items[0], items: t.items });
  t.feedback.like({ item: t.items[0], items: t.items });
  assert.deepEqual(t.entries("like"), [["like", "101"]]);
  await t.clock.tick(1500);
  t.feedback.like({ item: t.items[0], items: t.items });
  assert.deepEqual(t.entries("like").length, 2);
  assert.deepEqual(t.entries("select").at(-1), ["select", "102"]);
});

test("like: a missing control is reported once; already liked is silent", () => {
  const t = setup();
  t.posts[0].like = null;
  t.posts[0].likeState = "liked";
  t.feedback.like({ item: t.items[0], items: t.items });
  assert.deepEqual(t.entries("notice"), []);
  t.posts[0].likeState = "missing";
  t.feedback.like({ item: t.items[0], items: t.items });
  t.feedback.like({ item: t.items[0], items: t.items });
  assert.deepEqual(t.entries("notice"), [
    ["notice", "Like control not found."],
  ]);
  assert.deepEqual(t.entries("like"), []);
});
