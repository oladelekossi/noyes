import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load.mjs";

// Synthetic events through fake window and document capture listeners, in
// registration order, honoring stopImmediatePropagation like Chrome does.
function setup({ forYou = true, typing = false, overlay = false } = {}) {
  const log = [];
  const page = { forYou, typing, overlay, pending: false };
  const windowListeners = [];
  const documentListeners = [];
  const x = {
    onForYou: () => page.forYou,
    typingContext: () => page.typing,
    overlayOpen: () => page.overlay,
  };
  const items = [{ key: "1" }, { key: "2" }];
  const feed = {
    read: () => items,
    current: () => items[0],
  };
  const selection = {
    get: () => null,
    navigate: ({ direction }) => log.push(["navigate", direction]),
    select: ({ item, scroll }) => log.push(["select", item.key, scroll]),
    interrupt: () => log.push(["settle-stop"]),
  };
  const feedback = {
    pending: () => page.pending,
    interrupt: ({ source }) => log.push(["interrupt", source]),
    like: ({ item }) => log.push(["like", item.key]),
    dismiss: async ({ item }) => log.push(["dismiss", item.key]),
    undo: () => log.push(["undo"]),
    restorePrevious: () => false,
    state: () => (page.pending ? "opening" : "idle"),
  };
  const wheel = load({
    files: ["input.js"],
    globals: {
      __wheel: { x, feed, selection, feedback },
      // Same signatures as the globals they replace.
      addEventListener: (...args) =>
        windowListeners.push({ type: args[0], listener: args[1] }),
      document: {
        addEventListener: (...args) =>
          documentListeners.push({ type: args[0], listener: args[1] }),
      },
    },
  });
  wheel.input.install();

  function dispatch({ type = "keydown", ...init }) {
    const event = {
      type,
      isTrusted: true,
      repeat: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      isComposing: false,
      keyCode: 0,
      defaultPrevented: false,
      stopped: false,
      target: {},
      composedPath: () => [],
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {
        this.stopped = true;
      },
      ...init,
    };
    for (const listeners of [windowListeners, documentListeners])
      for (const { type: kind, listener } of listeners) {
        if (event.stopped) break;
        if (kind === type) listener(event);
      }
    return event;
  }
  const press = (init) => dispatch({ type: "keydown", ...init });
  const commands = () => log.filter(([kind]) => kind !== "settle-stop");
  return { log, page, press, dispatch, commands };
}

test("shortcuts map to commands and are consumed", () => {
  const t = setup();
  for (const key of ["k", "j", "l", "n", "u"]) {
    const event = t.press({ key });
    assert.equal(event.defaultPrevented, true, key);
  }
  assert.deepEqual(t.commands(), [
    ["interrupt", "shortcut"],
    ["navigate", 1],
    ["interrupt", "shortcut"],
    ["navigate", -1],
    ["interrupt", "shortcut"],
    ["select", "1", false],
    ["like", "1"],
    ["interrupt", "shortcut"],
    ["select", "1", false],
    ["dismiss", "1"],
    ["undo"],
  ]);
});

for (const [name, init, arrange = () => {}] of [
  ["a non-shortcut key", { key: "x" }],
  ["a modified key", { key: "k", ctrlKey: true }],
  ["a shifted key", { key: "k", shiftKey: true }],
  ["an IME composition", { key: "k", isComposing: true }],
  ["an IME keyCode 229", { key: "k", keyCode: 229 }],
  ["typing in a field", { key: "k" }, (t) => (t.page.typing = true)],
  ["off For You", { key: "k" }, (t) => (t.page.forYou = false)],
  ["an open overlay", { key: "k" }, (t) => (t.page.overlay = true)],
])
  test(`gate: ${name} passes through untouched`, () => {
    const t = setup();
    arrange(t);
    const event = t.press(init);
    assert.equal(event.defaultPrevented, false);
    assert.deepEqual(t.commands(), []);
  });

test("gate: an overlay wheel opened itself does not block shortcuts", () => {
  const t = setup({ overlay: true });
  t.page.pending = true;
  assert.equal(t.press({ key: "k" }).defaultPrevented, true);
  assert.deepEqual(t.commands(), [
    ["interrupt", "shortcut"],
    ["navigate", 1],
  ]);
});

test("gate: a repeat is consumed without a command", () => {
  const t = setup();
  assert.equal(t.press({ key: "k", repeat: true }).defaultPrevented, true);
  assert.deepEqual(t.commands(), []);
});

test("consumed keys swallow their keypress and keyup; others pass", () => {
  const t = setup();
  t.press({ key: "k" });
  assert.equal(t.dispatch({ type: "keypress", key: "k" }).stopped, true);
  assert.equal(t.dispatch({ type: "keyup", key: "k" }).stopped, true);
  assert.equal(t.dispatch({ type: "keyup", key: "k" }).stopped, false);
  assert.equal(t.dispatch({ type: "keyup", key: "x" }).stopped, false);
});

for (const key of ["l", "n"])
  test(`invariant: ${key} during a pending dismissal is consumed with no effect`, () => {
    const t = setup();
    t.page.pending = true;
    assert.equal(t.press({ key }).defaultPrevented, true);
    assert.deepEqual(t.commands(), []);
  });

test("invariant: u during a pending dismissal interrupts and does not undo", () => {
  const t = setup();
  t.page.pending = true;
  t.press({ key: "u" });
  assert.deepEqual(t.commands(), [["interrupt", "shortcut"]]);
});

for (const [name, init, source] of [
  ["an unconsumed key", { key: "x" }, "key"],
  ["a modified shortcut", { key: "n", metaKey: true }, "key"],
  ["Escape", { key: "Escape" }, "escape"],
  ["a modified Escape", { key: "Escape", shiftKey: true }, "key"],
])
  test(`pending dismissal: ${name} interrupts with source ${source}`, () => {
    const t = setup();
    t.page.pending = true;
    t.press(init);
    assert.deepEqual(t.commands(), [["interrupt", source]]);
  });

test("pending dismissal: untrusted keys and idle keys do not interrupt", () => {
  const t = setup();
  t.page.pending = true;
  t.press({ key: "x", isTrusted: false });
  t.page.pending = false;
  t.press({ key: "x" });
  assert.deepEqual(t.commands(), []);
});

for (const [name, init, source] of [
  ["a mouse press", { type: "pointerdown", pointerType: "mouse" }, "pointer"],
  ["a pen press", { type: "pointerdown", pointerType: "pen" }, "pointer"],
  ["a touch pointer", { type: "pointerdown", pointerType: "touch" }, "touch"],
  ["a touchstart", { type: "touchstart" }, "touch"],
])
  test(`${name} ends alignment and interrupts with source ${source}`, () => {
    const t = setup();
    t.dispatch(init);
    assert.deepEqual(t.log, [["settle-stop"], ["interrupt", source]]);
  });

test("an untrusted pointer ends alignment but never interrupts feedback", () => {
  const t = setup();
  t.dispatch({ type: "pointerdown", pointerType: "mouse", isTrusted: false });
  assert.deepEqual(t.log, [["settle-stop"]]);
});

test("keys end alignment, except repeats of a consumed key and synthetic Escape", () => {
  const t = setup();
  t.press({ key: "x" });
  assert.deepEqual(t.log, [["settle-stop"]]);
  t.log.length = 0;
  t.press({ key: "k" });
  t.press({ key: "k", repeat: true });
  t.press({ key: "Escape", isTrusted: false });
  assert.deepEqual(
    t.log.filter(([kind]) => kind === "settle-stop"),
    [["settle-stop"]],
  );
});
