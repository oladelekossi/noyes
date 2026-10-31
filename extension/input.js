// Input: turns raw keyboard, wheel, touch, and pointer events into commands
// (navigate, like, dismiss, undo) and interrupts of selection and feedback.
(() => {
  "use strict";
  const wheel = (globalThis.__wheel ??= {});
  if (wheel.input) return;

  const SHORTCUTS = ["j", "k", "l", "n", "u"];
  // Shortcut keys wheel consumed on keydown; their keypress and keyup are
  // swallowed too, and their repeats are not new navigation intent.
  const handledKeys = new Set();

  const unmodified = (event) =>
    !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

  function handleShortcut(event) {
    const { x, feed, selection, feedback } = wheel;
    const key = event.key;
    if (
      !SHORTCUTS.includes(key) ||
      !unmodified(event) ||
      event.isComposing ||
      event.keyCode === 229 ||
      x.typingContext({ event }) ||
      !x.onForYou()
    )
      return;
    // A menu opened by wheel can be cancelled by navigation. Other overlays
    // keep their native shortcuts and focus handling.
    if (x.overlayOpen() && !feedback.pending()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handledKeys.add(key);
    if (event.repeat) return;
    if (key === "u") {
      if (feedback.pending()) feedback.interrupt({ source: "shortcut" });
      else feedback.undo();
      return;
    }
    // Navigation cancels pending feedback; extra like/dismiss keys are consumed.
    if (feedback.pending() && (key === "n" || key === "l")) return;
    const items = feed.read();
    if (
      key === "j" &&
      !feedback.pending() &&
      feedback.restorePrevious({ items })
    )
      return;
    feedback.interrupt({ source: "shortcut" });

    if (key === "j" || key === "k") {
      selection.navigate({ items, direction: key === "k" ? 1 : -1 });
      return;
    }
    const current = feed.current({ items, selectionKey: selection.get() });
    if (!current) return;
    selection.select({ item: current, scroll: false });
    if (key === "l") feedback.like({ item: current, items });
    else void feedback.dismiss({ item: current, items });
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
    const wasAligning = wheel.selection.interrupt();
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

  function install() {
    // Deliberate input ends alignment first, so wheel never drags the page
    // back from the user; a navigation key then starts a new one.
    addEventListener("wheel", releaseForWheel, {
      capture: true,
      passive: false,
    });
    for (const type of ["touchstart", "pointerdown"])
      addEventListener(
        type,
        (event) => {
          wheel.selection.interrupt();
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
        if (!event.repeat || !handledKeys.has(event.key))
          wheel.selection.interrupt();
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
        if (
          !event.isTrusted ||
          (!wheel.feedback.pending() && wheel.feedback.state() !== "restoring")
        )
          return;
        wheel.feedback.interrupt({
          event,
          source:
            event.key === "Escape" && unmodified(event) ? "escape" : "key",
        });
      },
      true,
    );
  }

  wheel.input = Object.freeze({ install });
})();
