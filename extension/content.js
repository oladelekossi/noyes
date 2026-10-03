(() => {
  'use strict';
  if (globalThis.__wheelLoaded) return;
  globalThis.__wheelLoaded = true;

  const POST = 'article[data-testid="tweet"]';
  const BUTTON = '.wheel-button';
  const MENU = '[role="menu"]';
  const LABEL = 'Not interested';
  const ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 12h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 12 4 4 8-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let busy = false;
  let scheduled = false;
  let noticeTimer;

  const normalize = text => text.replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = element => element.isConnected && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const own = (post, selector) => [...post.querySelectorAll(selector)].find(element => element.closest(POST) === post);
  const postKey = post => {
    const time = own(post, 'time');
    return time?.closest('a[href]')?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
  };

  function onForYou() {
    if (location.pathname.replace(/\/$/, '') !== '/home') return false;
    const primary = document.querySelector('[data-testid="primaryColumn"]');
    return !!primary && [...primary.querySelectorAll('[role="tab"][aria-selected="true"]')]
      .some(tab => visible(tab) && normalize(tab.textContent) === 'for you');
  }

  function notify(message) {
    let notice = document.querySelector('.wheel-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'wheel-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      document.body.append(notice);
    }
    notice.textContent = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.remove(), 4500);
  }

  // Poll only during a user-requested action; stop before touching a recycled post
  // or a menu after the user navigates, presses a key, or clicks elsewhere.
  function waitFor(read, signal, timeout = 1600) {
    return new Promise((resolve, reject) => {
      const deadline = performance.now() + timeout;
      function tick() {
        if (signal.aborted) return reject(new Error('cancelled'));
        try {
          const result = read();
          if (result) return resolve(result);
        } catch (error) { return reject(error); }
        if (performance.now() >= deadline) return reject(new Error('timeout'));
        setTimeout(tick, 40);
      }
      tick();
    });
  }

  async function dismiss(post, button) {
    if (busy || button.disabled || !onForYou()) return;
    if ([...document.querySelectorAll(MENU)].some(visible) || document.querySelector('[role="dialog"]')) {
      notify('Close the open menu or dialog, then try again.');
      return;
    }
    const caret = own(post, '[data-testid="caret"]');
    const key = postKey(post);
    if (!caret || !key || button.dataset.postKey !== key) return;

    busy = true;
    button.disabled = true;
    button.dataset.state = 'pending';
    button.setAttribute('aria-label', 'Sending feedback…');
    const controller = new AbortController();
    const previousMenus = new Set(document.querySelectorAll(MENU));
    const cancel = event => { if (event.isTrusted) controller.abort(); };
    document.addEventListener('pointerdown', cancel, true);
    document.addEventListener('keydown', cancel, true);
    let menu;
    let succeeded = false;
    const assertCurrent = () => {
      if (!post.isConnected || postKey(post) !== key || !onForYou()) throw new Error('cancelled');
    };

    try {
      caret.click();
      menu = await waitFor(() => {
        assertCurrent();
        return [...document.querySelectorAll(MENU)].find(element => !previousMenus.has(element) && visible(element));
      }, controller.signal);
      const item = await waitFor(() => {
        assertCurrent();
        if (!visible(menu)) throw new Error('cancelled');
        // Exact labels only: never guess from an icon or click the first menu item.
        return [...menu.querySelectorAll('[role="menuitem"]')].find(element => {
          const label = normalize(element.textContent);
          return visible(element) && element.getAttribute('aria-disabled') !== 'true' &&
            ['not interested in this post', 'not interested in this tweet'].includes(label);
        });
      }, controller.signal);
      assertCurrent();
      if (controller.signal.aborted) throw new Error('cancelled');
      item.click();
      succeeded = true;
      button.dataset.state = 'done';
      button.innerHTML = CHECK;
      button.setAttribute('aria-label', 'Not interested selected');
      button.title = 'Not interested selected';
      // X owns the dismissal, confirmation, optional follow-up, and Undo.
      // Never hide a post locally and pretend feedback was sent.
    } catch (error) {
      if (error.message !== 'cancelled') {
        notify('“Not interested” isn’t available here. Nothing was changed.');
      }
      // Leave native menus alone on failure so the user can inspect or close them.
    } finally {
      document.removeEventListener('pointerdown', cancel, true);
      document.removeEventListener('keydown', cancel, true);
      if (!succeeded) {
        button.disabled = false;
        delete button.dataset.state;
        button.setAttribute('aria-label', LABEL);
      }
      busy = false;
    }
  }

  function sync() {
    scheduled = false;
    const enabled = onForYou();
    document.querySelectorAll(BUTTON).forEach(button => {
      const post = button.closest(POST);
      if (!enabled || !post || postKey(post) !== button.dataset.postKey) button.remove();
    });
    if (!enabled) return;
    const primary = document.querySelector('[data-testid="primaryColumn"]');
    primary.querySelectorAll(POST).forEach(post => {
      if (post.parentElement.closest(POST) || own(post, BUTTON)) return;
      if (post.querySelector('[data-testid="placementTracking"], [data-testid="promotedIndicator"]')) return;
      const key = postKey(post);
      const caret = own(post, '[data-testid="caret"]');
      if (!key || !caret) return;
      // Find the shared header row instead of changing X's fixed-width menu wrapper.
      let anchor = caret;
      let header = caret.parentElement;
      while (header && header !== post && !header.querySelector('[data-testid="User-Name"]')) {
        anchor = header;
        header = header.parentElement;
      }
      if (!header || header === post) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wheel-button';
      button.dataset.postKey = key;
      button.title = LABEL;
      button.setAttribute('aria-label', LABEL);
      button.innerHTML = ICON;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void dismiss(post, button);
      });
      header.insertBefore(button, anchor);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-selected', 'href'],
    characterData: true
  });
  addEventListener('popstate', schedule);
  addEventListener('hashchange', schedule);
  // Covers pushState navigation even when X reuses the existing DOM unchanged.
  setInterval(schedule, 1000);
  sync();
})();
