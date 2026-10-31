(() => {
  "use strict";
  if (globalThis.__wheelLoaded) return;
  globalThis.__wheelLoaded = true;

  const x = globalThis.__wheel.x;
  const SHORTCUTS = ["j", "k", "l", "n", "u"];
  const SKIP_NOTICE = "Skipped — feedback unavailable.";
  const VIEWPORT_TOP = x.layout.headerHeight;
  const VIEWPORT_BOTTOM = x.layout.bottomMargin;
  // Bound automatic alignment to a short navigation transition.
  const SETTLE_WINDOW = 1500;
  const SETTLE_CORRECTIONS = 3;
  const MENU_TIMEOUT = x.timing.menuTimeout;
  const POLL_INTERVAL = x.timing.pollInterval;
  const CANCELLED = new Error("cancelled");

  const dismissedPosts = new Map();
  const handledKeys = new Set();
  const pendingLikes = new Set();
  let scheduled = false;
  let noticeTimer;
  let selection = null;
  let settling = null;
  let pendingFeedback = null;
  let lastDismissal = null;

  // --- DOM helpers ---------------------------------------------------------

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const unmodified = (event) =>
    !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  const visible = x.visible;
  const postKey = (post) => x.postId({ post });
  const byKey = (key) => (item) => item.key === key;
  const onForYou = x.onForYou;
  const overlayOpen = x.overlayOpen;

  function notify(message) {
    let notice = document.querySelector(".wheel-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "wheel-notice";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      document.body.append(notice);
    }
    notice.textContent = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.remove(), 4500);
  }

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
    cancelFeedback({ allowLate: true, event });
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

  // --- Native actions ------------------------------------------------------

  function likePost(post) {
    const key = postKey(post);
    const like = x.likeControl({ post });
    if (!key || !like) return;
    if (pendingLikes.has(key)) return;
    pendingLikes.add(key);
    like.click();
    setTimeout(() => pendingLikes.delete(key), 1500);
  }

  function undoDismissal() {
    const candidates = lastDismissal ? x.undoControls(lastDismissal) : [];
    if (candidates.length !== 1) {
      notify("Undo unavailable.");
      return;
    }
    const { key, post } = lastDismissal;
    candidates[0].click();
    document.querySelector(".wheel-notice")?.remove();
    lastDismissal = null;
    dismissedPosts.delete(post);
    selectItem({ key });
  }

  // Stop before touching a recycled post or a menu after the user navigates,
  // presses a key, or clicks elsewhere.
  async function waitFor({ read, signal, timeout = MENU_TIMEOUT }) {
    const deadline = performance.now() + timeout;
    while (true) {
      if (signal.aborted) throw CANCELLED;
      const result = read();
      if (result) return result;
      if (performance.now() >= deadline) throw new Error("timeout");
      await sleep(POLL_INTERVAL);
    }
  }

  const closeMenu = (menu) => x.closeMenu({ menu });

  function cancelFeedback({ allowLate, event }) {
    const operation = pendingFeedback;
    if (!operation) return;
    if (x.menuAt({ element: event?.target })) {
      // Input inside a native menu transfers control to the user, including
      // before our polling has captured that menu. Do not interrupt its click.
      operation.menu = null;
      operation.allowLate = false;
    }
    operation.allowLate &&= allowLate;
    operation.controller.abort();
    closeMenu(operation.menu);
  }

  // Click X's own "Not interested" action for one post. Resolves "sent",
  // "unavailable", or undefined when cancelled or the post changed.
  async function dismiss(post) {
    if (pendingFeedback || !onForYou() || overlayOpen()) return;
    const key = postKey(post);
    if (!key) return;
    const caret = x.caret({ post });
    if (!caret) {
      notify(SKIP_NOTICE);
      return "unavailable";
    }

    const controller = new AbortController();
    const operation = {
      controller,
      previousMenus: new Set(x.menus({ root: document })),
      menu: null,
      allowLate: true,
      deadline: performance.now() + MENU_TIMEOUT,
    };
    pendingFeedback = operation;
    const discoverMenu = () =>
      x
        .menus({ root: document })
        .find((menu) => !operation.previousMenus.has(menu) && visible(menu));
    const current = () =>
      post.isConnected && postKey(post) === key && onForYou();
    const assertCurrent = () => {
      if (!current()) throw CANCELLED;
    };
    const cancel = (event) => {
      if (event.isTrusted)
        cancelFeedback({
          event,
          allowLate: event.key === "Escape" && unmodified(event),
        });
    };
    document.addEventListener("keydown", cancel, true);
    let outcome;

    try {
      caret.click();
      operation.menu = await waitFor({
        read: () => {
          assertCurrent();
          return discoverMenu();
        },
        signal: controller.signal,
      });
      const item = await waitFor({
        read: () => {
          assertCurrent();
          if (!visible(operation.menu)) throw CANCELLED;
          return x.feedbackItem({ menu: operation.menu });
        },
        signal: controller.signal,
      });
      assertCurrent();
      if (controller.signal.aborted) throw CANCELLED;
      dismissedPosts.set(post, { key, time: x.timestamp({ post }) });
      // Capture the native result's container before X can replace the article.
      const scope = x.cell({ post }) || post;
      item.click();
      lastDismissal = { key, post, scope };
      outcome = "sent";
      // X owns the dismissal, confirmation, optional follow-up, and Undo.
      // Never hide a post locally and pretend feedback was sent.
    } catch (error) {
      if (error === CANCELLED) controller.abort();
      else if (current() && !controller.signal.aborted) {
        // Discovery timed out on an unchanged post: skip it, leaving it intact.
        // A changed post or user cancellation is not a request to skip.
        outcome = "unavailable";
        closeMenu(operation.menu);
        notify(SKIP_NOTICE);
      }
    } finally {
      // Aborting dispatch does not cancel X's delayed menu creation. Retain
      // ownership until it arrives, unless later input could open a user menu.
      while (
        controller.signal.aborted &&
        operation.allowLate &&
        !operation.menu &&
        onForYou() &&
        performance.now() < operation.deadline
      ) {
        operation.menu = discoverMenu() || null;
        if (!operation.menu) await sleep(POLL_INTERVAL);
      }
      if (controller.signal.aborted) closeMenu(operation.menu);
      document.removeEventListener("keydown", cancel, true);
      if (outcome !== "sent") dismissedPosts.delete(post);
      if (pendingFeedback === operation) pendingFeedback = null;
    }
    return outcome;
  }

  // --- Shortcuts -----------------------------------------------------------

  function likeCurrent({ items, current }) {
    const nextKey = items[items.indexOf(current) + 1]?.key;
    likePost(current.target);
    if (nextKey) selectItem({ key: nextKey });
  }

  function dismissCurrent({ items, current }) {
    const index = items.indexOf(current);
    const nextKey = items[index + 1]?.key;
    const neighbors = [items[index + 1], items[index - 1]]
      .filter(Boolean)
      .map((item) => item.key);
    void dismiss(current.target).then((outcome) => {
      if (!outcome || !onForYou()) return;
      if (selection && selection.key !== current.key) return;
      if (outcome === "unavailable") {
        if (nextKey) selectItem({ key: nextKey });
        return;
      }
      // Prefer the captured next neighbor, then the previous one; a missing
      // next neighbor may still be remounting, so wait for it by ID.
      const available = readFeed();
      const next = neighbors
        .map((key) => available.find(byKey(key)))
        .find(Boolean);
      if (next) selectItem({ item: next });
      else if (neighbors[0]) selectItem({ key: neighbors[0] });
      else clearSelection();
    });
  }

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
    if (overlayOpen() && !pendingFeedback) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handledKeys.add(key);
    if (event.repeat) return;
    if (key === "u") {
      if (pendingFeedback) cancelFeedback({ allowLate: true });
      else undoDismissal();
      return;
    }
    // Navigation cancels pending feedback; extra like/dismiss keys are consumed.
    if (pendingFeedback && (key === "n" || key === "l")) return;
    cancelFeedback({ allowLate: true });

    const items = readFeed();
    if (key === "j" || key === "k") {
      navigate({ items, direction: key === "k" ? 1 : -1 });
      return;
    }
    const current = currentItem(items);
    if (!current) return;
    selectItem({ item: current, scroll: false });
    if (key === "l") likeCurrent({ items, current });
    else dismissCurrent({ items, current });
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
          cancelFeedback({
            event,
            allowLate: type === "touchstart" || event.pointerType === "touch",
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

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
