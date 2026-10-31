(() => {
  "use strict";
  if (globalThis.__wheelLoaded) return;
  globalThis.__wheelLoaded = true;

  const wheel = globalThis.__wheel;
  const x = wheel.x;
  const SHORTCUTS = ["j", "k", "l", "n", "u"];
  const VIEWPORT_TOP = x.layout.headerHeight;
  const VIEWPORT_BOTTOM = x.layout.bottomMargin;
  // Bound automatic alignment to a short navigation transition.
  const SETTLE_WINDOW = 1500;
  const SETTLE_CORRECTIONS = 3;

  const dismissedPosts = new Map();
  const handledKeys = new Set();
  let scheduled = false;
  let selection = null;
  let settling = null;

  // --- DOM helpers ---------------------------------------------------------

  const unmodified = (event) =>
    !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  const visible = x.visible;
  const postKey = (post) => x.postId({ post });
  const byKey = (key) => (item) => item.key === key;
  const onForYou = x.onForYou;
  const overlayOpen = x.overlayOpen;

  // --- Feed model ----------------------------------------------------------

  function readFeed() {
    const primary = x.column();
    if (!primary) return [];
    const items = [];
    let previous = null;
    for (const post of x.posts({ root: primary })) {
      const key = postKey(post);
      if (
        !visible(post) ||
        !key ||
        dismissedPosts.get(post)?.key === key ||
        x.isAd({ post })
      ) {
        previous = null;
        continue;
      }
      if (previous && x.isConversationRail({ post: previous, next: post })) {
        const item = items.at(-1);
        item.articles.push(post);
        item.target = post;
        item.key = key;
      } else items.push({ key, target: post, head: post, articles: [post] });
      previous = post;
    }
    return items;
  }

  function inViewport(item) {
    return (
      item.target.getBoundingClientRect().bottom > VIEWPORT_TOP &&
      item.head.getBoundingClientRect().top < innerHeight - VIEWPORT_BOTTOM
    );
  }

  function currentItem(items) {
    const selected = selection && items.find(byKey(selection.key));
    if (selected && inViewport(selected)) return selected;
    return items.find(inViewport);
  }

  // An atomic same-ID replacement is a rerender, not an Undo. Follow its
  // timestamp through the mutation batch; a removal without replacement is
  // the native result transition, even if Undo restores it in the same batch.
  function reconcileDismissals(records) {
    for (const [post, dismissed] of dismissedPosts) {
      if (
        !post.isConnected ||
        postKey(post) !== dismissed.key ||
        !visible(post)
      ) {
        dismissedPosts.delete(post);
        continue;
      }
      for (const record of records) {
        const removed = [...record.removedNodes].some((node) =>
          node.contains(dismissed.time),
        );
        if (!removed) continue;
        const replacement = [...record.addedNodes]
          .flatMap((node) => x.timestamps({ node }))
          .find(
            (time) =>
              x.timestampId({ time, target: record.target }) === dismissed.key,
          );
        if (!replacement) {
          dismissedPosts.delete(post);
          break;
        }
        dismissed.time = replacement;
      }
    }
  }

  // --- Selection and alignment ---------------------------------------------

  // Only touch a class when it changes, so painting does not feed the observer.
  const setClass = ({ element, name, on }) => {
    if (element.classList.contains(name) !== on)
      element.classList.toggle(name, on);
  };

  function paintSelection(item) {
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

  function stopSettling() {
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
  }

  function clearSelection() {
    stopSettling();
    paintSelection(null);
    selection = null;
  }

  function scrollToTop(head) {
    head.scrollIntoView({ block: "start", behavior: "instant" });
    return head.getBoundingClientRect().top;
  }

  // Run after DOM/scroll changes, before paint. A quiet-period debounce exposes
  // the wrong position for several frames before snapping back into place.
  function alignSelection() {
    const state = settling;
    if (!state) return;
    const now = performance.now();
    if (!selection || selection.key !== state.key || now >= state.until) {
      stopSettling();
      return;
    }
    const item = readFeed().find(byKey(state.key));
    if (!item) return;
    // Feedback can temporarily unmount the next post before selection advances.
    // Keep that navigation request until its ID returns, within the same bound.
    if (state.rest === null) {
      state.rest = scrollToTop(item.head);
      return;
    }
    const top = item.head.getBoundingClientRect().top;
    if (Math.abs(top - state.rest) <= 1 || overlayOpen()) return;
    if (state.corrections === SETTLE_CORRECTIONS) {
      stopSettling();
      return;
    }
    state.corrections += 1;
    state.rest = scrollToTop(item.head);
  }

  function settle() {
    alignSelection();
    if (settling) settling.frame = requestAnimationFrame(settle);
  }

  function selectItem({ item, key = item?.key, scroll = true }) {
    clearSelection();
    if (!key) return;
    item ||= readFeed().find(byKey(key));
    selection = { key };
    paintSelection(item);
    if (!scroll) return;
    document.documentElement.classList.add("wheel-aligning");
    settling = {
      key,
      // The feed's ends may not reach the header; that is not a shift.
      rest: item ? scrollToTop(item.head) : null,
      until: performance.now() + SETTLE_WINDOW,
      corrections: 0,
      frame: requestAnimationFrame(settle),
    };
  }

  function navigate({ items, direction }) {
    const current = currentItem(items);
    const next =
      current &&
      (selection?.key === current.key
        ? items[items.indexOf(current) + direction]
        : current);
    if (next) {
      selectItem({ item: next });
      return;
    }
    stopSettling();
    window.scrollBy({
      top:
        direction * Math.max(1, innerHeight - VIEWPORT_TOP - VIEWPORT_BOTTOM),
      behavior: "instant",
    });
  }

  const scrollsItself = (element) => {
    const style = getComputedStyle(element);
    return (
      (/auto|scroll/.test(style.overflowY) &&
        element.scrollHeight > element.clientHeight) ||
      (/auto|scroll/.test(style.overflowX) &&
        element.scrollWidth > element.clientWidth)
    );
  };

  function releaseForWheel(event) {
    wheel.feedback.interrupt({ source: "wheel", event });
    const wasAligning = !!settling;
    stopSettling();
    if (
      !wasAligning ||
      event.ctrlKey ||
      event.defaultPrevented ||
      !event.cancelable
    )
      return;
    // Leave nested scrollers (menus, text areas, etc.) to their native controls.
    const nested = event
      .composedPath()
      .some(
        (element) =>
          element instanceof Element &&
          element !== document.body &&
          element !== document.documentElement &&
          scrollsItself(element),
      );
    if (nested) return;
    // Chrome may already have queued a snap animation for this wheel event.
    // Apply this first delta once without snapping; later deltas stay native.
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : 1;
    window.scrollBy({
      top: event.deltaY * (event.deltaMode === 2 ? innerHeight : unit),
      left: event.deltaX * (event.deltaMode === 2 ? innerWidth : unit),
      behavior: "instant",
    });
  }

  // --- Shortcuts -----------------------------------------------------------

  function handleShortcut(event) {
    const key = event.key;
    if (
      !SHORTCUTS.includes(key) ||
      !unmodified(event) ||
      event.isComposing ||
      event.keyCode === 229 ||
      x.typingContext({ event }) ||
      !onForYou()
    )
      return;
    // A menu opened by wheel can be cancelled by navigation. Other overlays
    // keep their native shortcuts and focus handling.
    if (overlayOpen() && !wheel.feedback.pending()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handledKeys.add(key);
    if (event.repeat) return;
    if (key === "u") {
      if (wheel.feedback.pending())
        wheel.feedback.interrupt({ source: "shortcut" });
      else wheel.feedback.undo();
      return;
    }
    // Navigation cancels pending feedback; extra like/dismiss keys are consumed.
    if (wheel.feedback.pending() && (key === "n" || key === "l")) return;
    wheel.feedback.interrupt({ source: "shortcut" });

    const items = readFeed();
    if (key === "j" || key === "k") {
      navigate({ items, direction: key === "k" ? 1 : -1 });
      return;
    }
    const current = currentItem(items);
    if (!current) return;
    selectItem({ item: current, scroll: false });
    if (key === "l") wheel.feedback.like({ item: current, items });
    else void wheel.feedback.dismiss({ item: current, items });
  }

  // Deliberate input ends the watch first, so wheel never drags the page back
  // from the user; a navigation key then starts a new one.
  addEventListener("wheel", releaseForWheel, { capture: true, passive: false });
  for (const type of ["touchstart", "pointerdown"])
    addEventListener(
      type,
      (event) => {
        stopSettling();
        if (event.isTrusted)
          wheel.feedback.interrupt({
            event,
            source:
              type === "touchstart" || event.pointerType === "touch"
                ? "touch"
                : "pointer",
          });
      },
      { capture: true, passive: true },
    );
  addEventListener(
    "keydown",
    (event) => {
      // Native Escape cleanup must not cancel the new selection's alignment.
      if (event.key === "Escape" && !event.isTrusted) return;
      // Repeats of a consumed shortcut are ignored, not new navigation intent.
      if (!event.repeat || !handledKeys.has(event.key)) stopSettling();
    },
    true,
  );
  // Register in window capture at document_start, before X's own shortcuts.
  // Swallow the corresponding keypress/up, too, so n cannot compose.
  addEventListener("keydown", handleShortcut, true);
  for (const type of ["keypress", "keyup"])
    addEventListener(
      type,
      (event) => {
        if (!handledKeys.has(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (type === "keyup") handledKeys.delete(event.key);
      },
      true,
    );
  addEventListener("blur", () => handledKeys.clear());
  // Unconsumed keys cancel pending feedback; consumed shortcuts never reach
  // the document because handleShortcut stops them at the window.
  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.isTrusted || !wheel.feedback.pending()) return;
      wheel.feedback.interrupt({
        event,
        source: event.key === "Escape" && unmodified(event) ? "escape" : "key",
      });
    },
    true,
  );

  // --- Page observation ----------------------------------------------------

  function sync() {
    scheduled = false;
    if (!onForYou()) {
      clearSelection();
      return;
    }
    if (!selection) return;
    // React may replace the article or its class list. Keep identity separately
    // and restore the marker only on the same tweet, never on a recycled node.
    paintSelection(readFeed().find(byKey(selection.key)));
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  function start() {
    new MutationObserver((records) => {
      reconcileDismissals(records);
      alignSelection();
      schedule();
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-selected", "href", "class", "style"],
      characterData: true,
    });
    addEventListener("popstate", schedule);
    addEventListener("hashchange", schedule);
    addEventListener("scroll", () => alignSelection(), {
      capture: true,
      passive: true,
    });
    // Covers pushState navigation even when X reuses the existing DOM unchanged.
    setInterval(schedule, 1000);
    sync();
  }

  // Transitional bridge: feedback.js reaches feed and selection through these
  // until they become their own modules.
  wheel.feed = Object.freeze({
    read: readFeed,
    suppress: ({ post, key }) =>
      dismissedPosts.set(post, { key, time: x.timestamp({ post }) }),
    release: ({ post }) => dismissedPosts.delete(post),
  });
  wheel.selection = Object.freeze({
    get: () => selection?.key ?? null,
    select: selectItem,
    clear: clearSelection,
  });

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
