// Native actions: like, dismissal, and Undo. wheel only clicks X's own
// controls; X owns the dismissal, confirmation, optional follow-up, and Undo.
// Never hide a post locally and pretend feedback was sent.
(() => {
  "use strict";
  const wheel = (globalThis.__wheel ??= {});
  if (wheel.feedback) return;

  const SKIP_NOTICE = "Skipped — feedback unavailable.";
  const UNDO_NOTICE = "Undo unavailable.";
  const LIKE_COOLDOWN = 1500;
  // Interrupts from input that cannot open a user menu. After them, wheel
  // keeps watching for X's delayed feedback menu so it can close it. Any other
  // source (an unconsumed key, a mouse or pen press) may open a user menu, so
  // wheel stops claiming late menus. Input inside a visible native menu hands
  // that menu to the user whatever the source.
  const KEEPS_LATE_MENU = new Set(["shortcut", "escape", "wheel", "touch"]);

  const pendingLikes = new Set();
  // The one dismissal operation, or null. See `step` for its states.
  let operation = null;
  let lastDismissal = null;

  const now = () => performance.now();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const byKey = (key) => (item) => item.key === key;

  function like({ item, items }) {
    const { x, selection } = wheel;
    const nextKey = items[items.indexOf(item) + 1]?.key;
    const post = item.target;
    const key = x.postId({ post });
    const control = x.likeControl({ post });
    if (key && control && !pendingLikes.has(key)) {
      pendingLikes.add(key);
      control.click();
      setTimeout(() => pendingLikes.delete(key), LIKE_COOLDOWN);
    }
    if (nextKey) selection.select({ key: nextKey });
  }

  // --- Dismissal: an explicit state machine ---------------------------------
  //
  //   opening      caret clicked; polling for a menu that was not open before
  //   locating     menu captured; polling for the exact feedback item
  //   dispatched   item clicked; dismissal recorded            → idle
  //   unavailable  timed out on an unchanged post; notice      → idle
  //   cancelled    interrupted, or the post or page changed. While wheel still
  //                owns a late menu and none was captured, keep polling until
  //                the original deadline to close one that arrives late → idle
  //
  // `step` performs one transition and returns true when it must wait a poll
  // interval before the next. Only `interrupt` changes an operation from
  // outside; it takes effect at the next step.

  const WAIT = true;
  const NEXT = false;

  function enter({ op, state }) {
    op.state = state;
    if (state === "opening" || state === "locating")
      op.until = now() + wheel.x.timing.menuTimeout;
  }

  const current = (op) =>
    op.post.isConnected &&
    wheel.x.postId({ post: op.post }) === op.key &&
    wheel.x.onForYou();

  const discover = (op) =>
    wheel.x
      .menus({ root: document })
      .find((menu) => !op.previousMenus.has(menu) && wheel.x.visible(menu));

  function cancel(op) {
    op.aborted = true;
    enter({ op, state: "cancelled" });
    return NEXT;
  }

  function finish(op) {
    if (op.outcome !== "sent") wheel.feed.release({ post: op.post });
    if (operation === op) operation = null;
    op.state = "idle";
    return NEXT;
  }

  function step(op) {
    const { x, ui, feed } = wheel;
    switch (op.state) {
      case "opening": {
        if (op.aborted || !current(op)) return cancel(op);
        const menu = discover(op);
        if (menu) {
          op.menu = menu;
          enter({ op, state: "locating" });
          return NEXT;
        }
        if (now() < op.until) return WAIT;
        enter({ op, state: "unavailable" });
        return NEXT;
      }
      case "locating": {
        if (op.aborted || !current(op) || !x.visible(op.menu))
          return cancel(op);
        const item = x.feedbackItem({ menu: op.menu });
        if (item) {
          op.item = item;
          enter({ op, state: "dispatched" });
          return NEXT;
        }
        if (now() < op.until) return WAIT;
        enter({ op, state: "unavailable" });
        return NEXT;
      }
      case "dispatched": {
        feed.suppress({ post: op.post, key: op.key });
        // Capture the native result's container before X can replace the post.
        const scope = x.cell({ post: op.post }) || op.post;
        op.item.click();
        lastDismissal = { key: op.key, post: op.post, scope };
        op.outcome = "sent";
        return finish(op);
      }
      case "unavailable":
        // Skip the unchanged post, leaving it intact.
        x.closeMenu({ menu: op.menu });
        ui.notify({ message: SKIP_NOTICE });
        op.outcome = "unavailable";
        return finish(op);
      case "cancelled":
        // Aborting does not cancel X's delayed menu creation. Keep ownership
        // until it arrives, unless later input could have opened a user menu.
        if (
          op.ownsLateMenu &&
          !op.menu &&
          x.onForYou() &&
          now() < op.deadline
        ) {
          op.menu = discover(op) || null;
          return op.menu ? NEXT : WAIT;
        }
        x.closeMenu({ menu: op.menu });
        return finish(op);
      default:
        return finish(op);
    }
  }

  // Click X's own feedback action for one post. Resolves "sent",
  // "unavailable", or undefined when ignored, cancelled, or the post changed.
  async function send({ post }) {
    const { x, ui } = wheel;
    if (operation || !x.onForYou() || x.overlayOpen()) return undefined;
    const key = x.postId({ post });
    if (!key) return undefined;
    const caret = x.caret({ post });
    if (!caret) {
      ui.notify({ message: SKIP_NOTICE });
      return "unavailable";
    }
    const op = {
      post,
      key,
      previousMenus: new Set(x.menus({ root: document })),
      menu: null,
      item: null,
      ownsLateMenu: true,
      aborted: false,
      deadline: now() + x.timing.menuTimeout,
      until: 0,
      outcome: undefined,
      state: "idle",
    };
    operation = op;
    enter({ op, state: "opening" });
    caret.click();
    while (op.state !== "idle")
      if (step(op) === WAIT) await sleep(x.timing.pollInterval);
    return op.outcome;
  }

  // Dismiss the current item, then move the selection on.
  async function dismiss({ item, items }) {
    const { x, feed, selection } = wheel;
    const index = items.indexOf(item);
    const nextKey = items[index + 1]?.key;
    const neighbors = [items[index + 1], items[index - 1]]
      .filter(Boolean)
      .map((each) => each.key);
    const outcome = await send({ post: item.target });
    if (!outcome || !x.onForYou()) return outcome;
    const selected = selection.get();
    if (selected && selected !== item.key) return outcome;
    if (outcome === "unavailable") {
      if (nextKey) selection.select({ key: nextKey });
      return outcome;
    }
    // Prefer the captured next neighbor, then the previous one; a missing
    // next neighbor may still be remounting, so wait for it by ID.
    const available = feed.read();
    const next = neighbors
      .map((key) => available.find(byKey(key)))
      .find(Boolean);
    if (next) selection.select({ item: next });
    else if (neighbors[0]) selection.select({ key: neighbors[0] });
    else selection.clear();
    return outcome;
  }

  // The single cancellation entry point. `event` is the input that caused it,
  // when there is one, so input inside a native menu can hand that menu over.
  function interrupt({ source, event }) {
    const op = operation;
    if (!op) return;
    if (event && wheel.x.menuAt({ element: event.target })) {
      // Input inside a native menu transfers control to the user, including
      // before polling has captured that menu. Do not interrupt its click.
      op.menu = null;
      op.ownsLateMenu = false;
    }
    if (!KEEPS_LATE_MENU.has(source)) op.ownsLateMenu = false;
    op.aborted = true;
    wheel.x.closeMenu({ menu: op.menu });
  }

  function undo() {
    const { x, ui, feed, selection } = wheel;
    const candidates = lastDismissal ? x.undoControls(lastDismissal) : [];
    if (candidates.length !== 1) {
      ui.notify({ message: UNDO_NOTICE });
      return;
    }
    const { key, post } = lastDismissal;
    candidates[0].click();
    ui.clearNotice();
    lastDismissal = null;
    feed.release({ post });
    selection.select({ key });
  }

  const pending = () => !!operation;
  const state = () => operation?.state ?? "idle";

  wheel.feedback = Object.freeze({
    like,
    dismiss,
    undo,
    interrupt,
    pending,
    state,
  });
})();
