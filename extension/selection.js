// Selection: which item is selected, its outline, and the short align/settle
// process that keeps a newly selected item under X's header while the feed
// shifts around it.
(() => {
  "use strict";
  const wheel = (globalThis.__wheel ??= {});
  if (wheel.selection) return;

  // Bound automatic alignment to a short navigation transition.
  const SETTLE_WINDOW = 1500;
  const SETTLE_CORRECTIONS = 3;

  // { key } | null. Identity is the post ID, never a DOM node: React may
  // replace the article, and a recycled node must not keep the marker.
  let selection = null;
  // The running align/settle process, or null.
  let settling = null;

  const byKey = (key) => (item) => item.key === key;

  // Only touch a class when it changes, so painting does not feed the observer.
  const setClass = ({ element, name, on }) => {
    if (element.classList.contains(name) !== on)
      element.classList.toggle(name, on);
  };

  function paint({ item }) {
    const group = item?.articles || [];
    const thread = group.length > 1;
    const painted = document.querySelectorAll(".wheel-selected, .wheel-thread");
    for (const element of new Set([...painted, ...group])) {
      const active = group.includes(element);
      setClass({ element, name: "wheel-selected", on: active });
      setClass({ element, name: "wheel-thread", on: active && thread });
      setClass({
        element,
        name: "wheel-thread-start",
        on: active && thread && element === group[0],
      });
      setClass({
        element,
        name: "wheel-thread-end",
        on: active && thread && element === group.at(-1),
      });
    }
  }

  // Ends alignment. Returns whether it was running.
  function interrupt() {
    const wasAligning = !!settling;
    if (settling) cancelAnimationFrame(settling.frame);
    settling = null;
    document.documentElement.classList.remove("wheel-aligning");
    if (wasAligning) {
      // Commit removal before the next wheel default action; otherwise Chrome
      // can use its previous snap target and animate the manual scroll back.
      document.documentElement.getBoundingClientRect();
      window.scrollTo({ top: scrollY, left: scrollX, behavior: "instant" });
    }
    return wasAligning;
  }

  function clear() {
    interrupt();
    paint({ item: null });
    selection = null;
  }

  function scrollToTop(head) {
    head.scrollIntoView({ block: "start", behavior: "instant" });
    return head.getBoundingClientRect().top;
  }

  // Run after DOM/scroll changes, before paint. A quiet-period debounce exposes
  // the wrong position for several frames before snapping back into place.
  function align() {
    const state = settling;
    if (!state) return;
    const now = performance.now();
    if (!selection || selection.key !== state.key || now >= state.until) {
      interrupt();
      return;
    }
    const item = wheel.feed.read().find(byKey(state.key));
    if (!item) return;
    // Feedback can temporarily unmount the next post before selection advances.
    // Keep that navigation request until its ID returns, within the same bound.
    if (state.rest === null) {
      state.rest = scrollToTop(item.head);
      return;
    }
    const top = item.head.getBoundingClientRect().top;
    if (Math.abs(top - state.rest) <= 1 || wheel.x.overlayOpen()) return;
    if (state.corrections === SETTLE_CORRECTIONS) {
      interrupt();
      return;
    }
    state.corrections += 1;
    state.rest = scrollToTop(item.head);
  }

  function settle() {
    align();
    if (settling) settling.frame = requestAnimationFrame(settle);
  }

  function select({
    item,
    key = item?.key,
    scroll = true,
    until = performance.now() + SETTLE_WINDOW,
  }) {
    clear();
    if (!key) return;
    item ||= wheel.feed.read().find(byKey(key));
    selection = { key };
    paint({ item });
    if (!scroll) return;
    document.documentElement.classList.add("wheel-aligning");
    settling = {
      key,
      // The feed's ends may not reach the header; that is not a shift.
      rest: item ? scrollToTop(item.head) : null,
      until: Math.min(until, performance.now() + SETTLE_WINDOW),
      corrections: 0,
      frame: requestAnimationFrame(settle),
    };
  }

  // Select the neighbor in `direction` (1 down, -1 up). With nothing selected
  // on screen, select the current item; at an unloaded boundary, scroll a page.
  function navigate({ items, direction }) {
    const current = wheel.feed.current({ items, selectionKey: get() });
    const next =
      current &&
      (selection?.key === current.key
        ? items[items.indexOf(current) + direction]
        : current);
    if (next) {
      select({ item: next });
      return;
    }
    interrupt();
    const { headerHeight, bottomMargin } = wheel.x.layout;
    window.scrollBy({
      top: direction * Math.max(1, innerHeight - headerHeight - bottomMargin),
      behavior: "instant",
    });
  }

  const get = () => selection?.key ?? null;

  wheel.selection = Object.freeze({
    get,
    select,
    clear,
    interrupt,
    paint,
    align,
    navigate,
  });
})();
