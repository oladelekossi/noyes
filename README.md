# wheel

Fine-tune your X feed. One small button.

wheel adds a quiet ⊖ button beside the menu on posts in your **For You** feed. Click it to select X’s native **Not interested in this post** action. X handles the dismissal, confirmation, any follow-up questions, and Undo.

No settings, accounts, API keys, or build step. No automatic feed browsing.

## Install locally

For Chrome and Chromium-based browsers:

1. Download or clone this repository.
2. Open your browser’s extensions page (`chrome://extensions` in Chrome).
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the **extension** folder inside this repository.
5. Refresh X, open **For You**, and look for the small circle-minus beside each post’s menu.

After changing the extension files, click **Reload** on wheel’s extension card and refresh X.

## What to expect

- Works with X’s **English** web interface on `x.com` and `twitter.com`.
- Buttons appear only in the **For You** feed, including newly loaded posts as you scroll.
- Keyboard accessible: Tab to the button and press Enter or Space.
- If X doesn’t offer the exact feedback action, wheel leaves the post alone and shows a short notice. It never substitutes mute, block, report, or ad feedback.
- A native menu may briefly appear while the action runs. Any follow-up prompt stays under your control.
- Navigating away, pressing a key, or clicking elsewhere cancels an action that is still waiting for a menu.
- X controls recommendation changes. wheel cannot promise how much or how quickly your feed changes.

This first version is for the desktop web app; it does not modify X’s native phone app. X can change its page structure or wording and break the shortcut.

## Privacy

wheel runs only on X/Twitter pages. It reads the displayed post header and menu to carry out the click you requested. It has no analytics, storage, backend, external requests, or third-party runtime dependencies. Feedback is sent through X’s own interface.

## Development

```sh
npm ci
npx playwright install chromium
npm run check
npm test
npm run package
```

The installable extension is the `extension/` directory. Packaging writes `dist/wheel-0.1.0.zip`, containing only the extension files. Extract it before using Load unpacked.

The tests use a simulated X feed to exercise post targeting, native Undo, missing menu actions, tab changes, delayed menus, cancellation, recycled posts, keyboard access, and light/dark appearance. An additional test loads the real extension in an isolated Chromium profile and verifies automatic injection. No tests submit feedback on a real X account.

To use a separately installed Chromium or Chrome for Testing binary for the extension-loading test, set `WHEEL_CHROMIUM_EXECUTABLE` to its executable path. Regular Chrome releases may not permit command-line extension loading.

Live compatibility with a signed-in X account remains to be verified.
