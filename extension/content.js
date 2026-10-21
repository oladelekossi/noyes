(() => {
  "use strict";
  if (globalThis.__wheelLoaded) return;
  globalThis.__wheelLoaded = true;

  const POST = 'article[data-testid="tweet"]';
  const MENU = '[role="menu"]';
  const VIEWPORT_TOP = 100;
  const VIEWPORT_BOTTOM = 32;
  // Bound automatic alignment to a short navigation transition.
  const SETTLE_WINDOW = 1500;
  const SETTLE_CORRECTIONS = 3;
  const dismissedPosts = new Map();
  let scheduled = false;
  let noticeTimer;
  let selection = null;
  let settling = null;
  let pendingFeedback = null;
  let lastDismissal = null;
  const handledKeys = new Set();
  const pendingLikes = new Set();

  const normalize = (text) => text.replace(/\s+/g, " ").trim().toLowerCase();
  const visible = (element) =>
    element.isConnected &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== "hidden";
  const own = ({ post, selector }) =>
    [...post.querySelectorAll(selector)].find(
      (element) => element.closest(POST) === post,
    );
  const postKey = (post) => {
    const time = own({ post: post, selector: "time" });
    return time
      ?.closest("a[href]")
      ?.getAttribute("href")
      ?.match(/\/status\/(\d+)/)?.[1];
  };

  function onForYou() {
    if (location.pathname.replace(/\/$/, "") !== "/home") return false;
    const primary = document.querySelector('[data-testid="primaryColumn"]');
    return (
      !!primary &&
      [...primary.querySelectorAll('[role="tab"][aria-selected="true"]')].some(
        (tab) => visible(tab) && normalize(tab.textContent) === "for you",
      )
    );
  }

  function continuesConversation({ post, next }) {
    const cell = post.closest('[data-testid="cellInnerDiv"]');
    const nextCell = next.closest('[data-testid="cellInnerDiv"]');
    if (cell && cell === nextCell) return true;
    // Separate virtualized cells are joined only by X's visible avatar rail.
    // Mentions, authors, and nearby timestamps are not conversation evidence.
    if (!cell || cell.nextElementSibling !== nextCell) return false;
    const avatar = own({ post, selector: '[data-testid="Tweet-User-Avatar"]' });
    if (!avatar) return false;
    const avatarRect = avatar.getBoundingClientRect();
    const rect = post.getBoundingClientRect();
    if (Math.abs(next.getBoundingClientRect().top - rect.bottom) > 4)
      return false;
    return [...post.querySelectorAll("div")].some((line) => {
      if (line.childElementCount || line.closest(POST) !== post) return false;
      const rail = line.getBoundingClientRect();
      if (!(
        rail.width >= 1 &&
        rail.width <= 3 &&
        rail.height > 8 &&
        Math.abs(
          rail.left + rail.width / 2 - (avatarRect.left + avatarRect.width / 2),
        ) < 4 &&
        rail.top >= avatarRect.bottom - 4 &&
        Math.abs(rail.bottom - rect.bottom) <= 4
      ))
        return false;
      const background = getComputedStyle(line).backgroundColor;
      if (
        !visible(line) ||
        background === "transparent" ||
        background === "rgba(0, 0, 0, 0)"
      )
        return false;
      for (let ancestor = line; ancestor; ancestor = ancestor.parentElement) {
        if (Number(getComputedStyle(ancestor).opacity) === 0) return false;
      }
      return true;
    });
  }

  function readFeed() {
    const primary = document.querySelector('[data-testid="primaryColumn"]');
    if (!primary) return [];
    const items = [];
    let previous;
    for (const post of primary.querySelectorAll(POST)) {
      if (post.parentElement.closest(POST)) continue;
      const key = postKey(post);
      if (
        !visible(post) ||
        !key ||
        dismissedPosts.get(post)?.key === key ||
        post.closest('[data-testid="placementTracking"]') ||
        post.querySelector(
          '[data-testid="placementTracking"], [data-testid="promotedIndicator"]',
        )
      ) {
        previous = null;
        continue;
      }
      if (previous && continuesConversation({ post: previous, next: post })) {
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
        if (
          ![...record.removedNodes].some((node) =>
            node.contains(dismissed.time),
          )
        )
          continue;
        const replacement = [...record.addedNodes]
          .flatMap((node) =>
            node instanceof Element
              ? node.matches("time")
                ? [node]
                : [...node.querySelectorAll("time")]
              : [],
          )
          .find((time) => {
            const anchor =
              time.closest("a[href]") || record.target.closest?.("a[href]");
            return (
              anchor?.getAttribute("href")?.match(/\/status\/(\d+)/)?.[1] ===
              dismissed.key
            );
          });
        if (!replacement) {
          dismissedPosts.delete(post);
          break;
        }
        dismissed.time = replacement;
      }
    }
  }

  function paintSelection(item) {
    const group = item?.articles || [];
    const classes = [
      "wheel-selected",
      "wheel-thread",
      "wheel-thread-start",
      "wheel-thread-end",
    ];
    const elements = new Set([
      ...document.querySelectorAll(".wheel-selected, .wheel-thread"),
      ...group,
    ]);
    for (const element of elements) {
      const active = group.includes(element);
      const flags = [
        active,
        active && group.length > 1,
        active && group.length > 1 && element === group[0],
        active && group.length > 1 && element === group.at(-1),
      ];
      classes.forEach((name) => {
        const enabled = flags[classes.indexOf(name)];
        if (element.classList.contains(name) !== enabled)
          element.classList.toggle(name, enabled);
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
    const nested = event.composedPath().some((element) => {
      if (
        !(element instanceof Element) ||
        element === document.body ||
        element === document.documentElement
      )
        return false;
      const style = getComputedStyle(element);
      return (
        (/auto|scroll/.test(style.overflowY) &&
          element.scrollHeight > element.clientHeight) ||
        (/auto|scroll/.test(style.overflowX) &&
          element.scrollWidth > element.clientWidth)
      );
    });
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
    const item = readFeed().find((candidate) => candidate.key === state.key);
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
    item ||= readFeed().find((candidate) => candidate.key === key);
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

  function currentItem(items) {
    const selected =
      selection && items.find((item) => item.key === selection.key);
    if (selected && inViewport(selected)) return selected;
    return items.find(inViewport);
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

  function typing(event) {
    return event
      .composedPath()
      .concat(document.activeElement)
      .some(
        (element) =>
          element instanceof Element &&
          (element.isContentEditable ||
            element.closest(
              'input, textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"]',
            )),
      );
  }

  function overlayOpen() {
    return [
      ...document.querySelectorAll(
        '[role="menu"], [role="dialog"], [aria-modal="true"]',
      ),
    ].some(visible);
  }

  function likePost(post) {
    const key = postKey(post);
    const like = own({ post: post, selector: '[data-testid="like"]' });
    // "l" means like, not toggle. Never activate the native unlike control.
    if (
      !key ||
      !like ||
      !visible(like) ||
      like.disabled ||
      like.getAttribute("aria-disabled") === "true" ||
      pendingLikes.has(key)
    )
      return;
    pendingLikes.add(key);
    like.click();
    setTimeout(() => pendingLikes.delete(key), 1500);
  }

  function undoDismissal() {
    const dismissed = lastDismissal;
    const { key, post, scope } = dismissed || {};
    const candidates =
      scope?.isConnected &&
      (!post.isConnected || !postKey(post)) &&
      (post.isConnected || ![...scope.querySelectorAll(POST)].some(postKey))
        ? [...scope.querySelectorAll('button, [role="button"]')].filter(
            (button) => {
              const owner = button.closest(POST);
              if (
                (owner && owner !== post) ||
                !visible(button) ||
                button.disabled ||
                button.getAttribute("aria-disabled") === "true" ||
                normalize(button.textContent) !== "undo"
              )
                return false;
              for (
                let element = button;
                element;
                element = element.parentElement
              ) {
                if (
                  element.matches('[hidden], [inert], [aria-hidden="true"]') ||
                  Number(getComputedStyle(element).opacity) === 0
                )
                  return false;
              }
              return true;
            },
          )
        : [];
    if (candidates.length !== 1) {
      notify("Undo unavailable.");
      return;
    }
    candidates[0].click();
    document.querySelector(".wheel-notice")?.remove();
    lastDismissal = null;
    dismissedPosts.delete(post);
    selectItem({ key });
  }

  function handleShortcut(event) {
    const key = event.key;
    if (
      !["j", "k", "l", "n", "u"].includes(key) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      event.isComposing ||
      event.keyCode === 229 ||
      typing(event) ||
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
    if (key === "l") {
      const nextKey = items[items.indexOf(current) + 1]?.key;
      likePost(current.target);
      if (nextKey) selectItem({ key: nextKey });
      return;
    }
    const keyBefore = current.key;
    const index = items.indexOf(current);
    const nextKey = items[index + 1]?.key;
    const neighbors = [items[index + 1], items[index - 1]]
      .filter(Boolean)
      .map((item) => item.key);
    void dismiss(current.target).then((outcome) => {
      if (!outcome || !onForYou() || (selection && selection.key !== keyBefore))
        return;
      if (outcome === "unavailable") {
        if (nextKey) selectItem({ key: nextKey });
        return;
      }
      const available = readFeed();
      const next = neighbors
        .map((key) => available.find((item) => item.key === key))
        .find(Boolean);
      if (next) selectItem({ item: next });
      else if (neighbors[0]) selectItem({ key: neighbors[0] });
      else clearSelection();
    });
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

  // Poll only during a user-requested action; stop before touching a recycled post
  // or a menu after the user navigates, presses a key, or clicks elsewhere.
  async function waitFor({ read, signal, timeout = 1600 }) {
    const deadline = performance.now() + timeout;
    while (true) {
      if (signal.aborted) throw new Error("cancelled");
      const result = read();
      if (result) return result;
      if (performance.now() >= deadline) throw new Error("timeout");
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  function closeMenu(menu) {
    if (!menu?.isConnected || !visible(menu)) return;
    for (const type of ["keydown", "keyup"])
      menu.dispatchEvent(
        new KeyboardEvent(type, {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          which: 27,
          bubbles: true,
        }),
      );
  }

  function cancelFeedback({ allowLate, event }) {
    const operation = pendingFeedback;
    if (!operation) return;
    const menu = event?.target.closest?.(MENU);
    if (menu && visible(menu)) {
      // Input inside a native menu transfers control to the user, including
      // before our polling has captured that menu. Do not interrupt its click.
      operation.menu = null;
      operation.allowLate = false;
    }
    operation.allowLate &&= allowLate;
    operation.controller.abort();
    closeMenu(operation.menu);
  }

  async function dismiss(post) {
    if (pendingFeedback || !onForYou() || overlayOpen()) return;
    const caret = own({ post: post, selector: '[data-testid="caret"]' });
    const key = postKey(post);
    if (!key) return;
    if (!caret || !visible(caret)) {
      notify("Skipped — feedback unavailable.");
      return "unavailable";
    }

    const controller = new AbortController();
    const operation = {
      controller,
      previousMenus: new Set(document.querySelectorAll(MENU)),
      menu: null,
      allowLate: true,
      deadline: performance.now() + 1600,
    };
    pendingFeedback = operation;
    const discoverMenu = () =>
      [...document.querySelectorAll(MENU)].find(
        (element) => !operation.previousMenus.has(element) && visible(element),
      );
    const cancel = (event) => {
      if (event.isTrusted)
        cancelFeedback({
          event,
          allowLate:
            event.key === "Escape" &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            !event.shiftKey,
        });
    };
    document.addEventListener("keydown", cancel, true);
    let succeeded = false;
    let unavailable = false;
    const assertCurrent = () => {
      if (!post.isConnected || postKey(post) !== key || !onForYou())
        throw new Error("cancelled");
    };

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
          if (!visible(operation.menu)) throw new Error("cancelled");
          // Exact labels only: never guess from an icon or click the first menu item.
          return [...operation.menu.querySelectorAll('[role="menuitem"]')].find(
            (element) => {
              const label = normalize(element.textContent);
              return (
                visible(element) &&
                element.getAttribute("aria-disabled") !== "true" &&
                [
                  "not interested in this post",
                  "not interested in this tweet",
                ].includes(label)
              );
            },
          );
        },
        signal: controller.signal,
      });
      assertCurrent();
      if (controller.signal.aborted) throw new Error("cancelled");
      dismissedPosts.set(post, { key, time: own({ post, selector: "time" }) });
      // Capture the native result's container before X can replace the article.
      const dismissed = {
        key,
        post,
        scope: post.closest('[data-testid="cellInnerDiv"]') || post,
      };
      item.click();
      lastDismissal = dismissed;
      succeeded = true;
      // X owns the dismissal, confirmation, optional follow-up, and Undo.
      // Never hide a post locally and pretend feedback was sent.
    } catch (error) {
      if (error.message === "cancelled") controller.abort();
      else {
        try {
          assertCurrent();
          if (controller.signal.aborted) throw new Error("cancelled");
          unavailable = true;
          closeMenu(operation.menu);
          notify("Skipped — feedback unavailable.");
        } catch {
          // A changed post or user cancellation is not a request to skip.
        }
      }
    } finally {
      // Aborting dispatch does not cancel X's delayed menu creation. Retain
      // ownership until it arrives, unless later input could open a user menu.
      while (
        controller.signal.aborted &&
        !operation.menu &&
        operation.allowLate &&
        onForYou() &&
        performance.now() < operation.deadline
      ) {
        operation.menu = discoverMenu();
        if (operation.menu) break;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      if (controller.signal.aborted) closeMenu(operation.menu);
      document.removeEventListener("keydown", cancel, true);
      if (!succeeded) dismissedPosts.delete(post);
      if (pendingFeedback === operation) pendingFeedback = null;
    }
    return succeeded ? "sent" : unavailable ? "unavailable" : undefined;
  }

  function sync() {
    scheduled = false;
    if (!onForYou()) {
      clearSelection();
      return;
    }
    if (!selection) return;
    // React may replace the article or its class list. Keep identity separately
    // and restore the marker only on the same tweet, never on a recycled node.
    const item = readFeed().find(
      (candidate) => candidate.key === selection.key,
    );
    paintSelection(item);
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
