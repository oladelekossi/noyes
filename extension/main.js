// Starts noyes once per page: input listeners, page observation, repainting,
// and the check that tells the user when X's layout has drifted away.
(() => {
  "use strict";
  const noyes = (globalThis.__noyes ??= {});
  if (noyes.main) return;
  noyes.main = Object.freeze({ started: performance.now() });

  const DRIFT_NOTICE =
    "noyes can't read this feed layout — shortcuts are off until noyes is updated.";
  const DRIFT_INTERVAL = 1000;
  const DRIFT_MIN_ARTICLES = 3;
  const DRIFT_STRIKES = 2;

  let scheduled = false;
  const drift = { checked: -Infinity, strikes: 0, noticed: false };

  // The page has posts but noyes cannot recognize them or their IDs. Checked
  // at most once a second; two failed checks in a row show one notice per load.
  function checkDrift() {
    const now = performance.now();
    if (drift.noticed || now - drift.checked < DRIFT_INTERVAL) return;
    drift.checked = now;
    const root = noyes.x.column();
    const health = root && noyes.x.health({ root });
    const unreadable =
      !!health &&
      health.articles >= DRIFT_MIN_ARTICLES &&
      (health.post === 0 || health.withId === 0);
    drift.strikes = unreadable ? drift.strikes + 1 : 0;
    if (drift.strikes < DRIFT_STRIKES) return;
    drift.noticed = true;
    noyes.ui.notify({ message: DRIFT_NOTICE });
  }

  function sync() {
    scheduled = false;
    if (!noyes.x.onForYou()) {
      noyes.selection.clear();
      return;
    }
    checkDrift();
    const key = noyes.selection.get();
    if (!key) return;
    // React may replace the article or its class list. Keep identity separately
    // and restore the marker only on the same post, never on a recycled node.
    noyes.selection.paint({
      item: noyes.feed.read().find((item) => item.key === key),
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  function start() {
    new MutationObserver((records) => {
      noyes.feed.reconcile({ records });
      noyes.feedback.reconcile();
      noyes.selection.align();
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
    addEventListener("scroll", () => noyes.selection.align(), {
      capture: true,
      passive: true,
    });
    // Covers pushState navigation even when X reuses the existing DOM unchanged.
    setInterval(schedule, 1000);
    sync();
  }

  noyes.ui.setLayoutVars({ layout: noyes.x.layout });
  noyes.input.install();
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
