// noyes's own page UI: the transient notice and layout CSS variables.
(() => {
  "use strict";
  const noyes = (globalThis.__noyes ??= {});
  if (noyes.ui) return;

  const NOTICE_DURATION = 4500;
  let noticeTimer;

  function notify({ message }) {
    let notice = document.querySelector(".noyes-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "noyes-notice";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      document.body.append(notice);
    }
    notice.textContent = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.remove(), NOTICE_DURATION);
  }

  function clearNotice() {
    document.querySelector(".noyes-notice")?.remove();
  }

  // X's header height has one home, x.layout; content.css reads it from here.
  function setLayoutVars({ layout }) {
    document.documentElement.style.setProperty(
      "--noyes-header-height",
      `${layout.headerHeight}px`,
    );
  }

  noyes.ui = Object.freeze({ notify, clearNotice, setLayoutVars });
})();
