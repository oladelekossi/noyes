# wheel

Fine-tune your X feed from the keyboard.

For agents working on this repository, read [AGENTS.md](AGENTS.md).

wheel lets you move through your **For You** feed and send likes or **Not interested** feedback from the keyboard. A green outline marks the entire selected post. X handles dismissal, confirmation, any follow-up questions, and Undo.

No settings, accounts, API keys, or build step. No automatic feed browsing.

## Install locally

For Chrome and Chromium-based browsers:

1. Download or clone this repository.
2. Open your browser’s extensions page (`chrome://extensions` in Chrome).
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the **extension** folder inside this repository.
5. Refresh X, open **For You**, and press `k` to select a post.

After changing the extension files, click **Reload** on wheel’s extension card and refresh X.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `k` | Next post |
| `j` | Previous post |
| `l` | Like, then select the next post (never unlike) |
| `n` | Not interested, then select the next post |

The first navigation key selects the first visible post. A green box outlines the selected post; navigation shows its top below the feed header. The green box follows the same tweet through X’s page updates. You can also press `l` or `n` immediately to act on the first visible post. After manually scrolling past the selection, the next shortcut starts from your visible feed. `l` also advances past already-liked posts; at the last loaded post it stays put. `n` advances as soon as the native feedback action is clicked, and stays on the current post if feedback is unavailable.

Shortcuts work in **For You**, stay inactive while typing or using a dialog/menu, and leave modifier shortcuts alone. Holding a key does not repeat actions. wheel takes precedence over X’s native shortcuts for these four keys in this context.

## What to expect

- Works with X’s **English** web interface on `x.com` and `twitter.com`.
- Shortcuts work only in the **For You** feed, including newly loaded posts as you scroll.
- No extra buttons are added to posts.
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
npm run test:vet
npm test
npm run package
```

The installable extension is the `extension/` directory. Packaging writes `dist/wheel-0.2.0.zip`, containing only the extension files. Extract it before using Load unpacked.

The tests use a simulated X feed to exercise post targeting, native Undo, missing menu actions, tab changes, delayed menus, cancellation, recycled posts, keyboard navigation and actions, typing protection, native shortcut conflicts, and light/dark appearance. An additional test loads the real extension in an isolated Chromium profile and verifies automatic injection. No tests submit feedback on a real X account.

To use a separately installed Chromium or Chrome for Testing binary for the extension-loading test, set `WHEEL_CHROMIUM_EXECUTABLE` to its executable path. Regular Chrome releases may not permit command-line extension loading.

Installation, keyboard selection, the green outline, and removal of the extra buttons were verified on a signed-in X account. Live like/feedback dispatch and automatic advancement still need live verification.

## Code quality with vet

`npm run check` runs [vet](https://github.com/gdevillele/vet). It checks every tracked or unignored JavaScript file (`.js`, `.mjs`, `.cjs`), including tests and tooling, plus GitHub workflows. Generated output and dependencies are ignored by Git. It enforces:

- At most one function parameter; related arguments use a named options object.
- Prettier formatting.
- Full commit SHA pins for external GitHub Actions.

Use `npm run format` to fix formatting, `npm run vet:all` for all diagnostics as JSON, or `npm run vet -- extension/content.js` to inspect a file. The same check runs in GitHub Actions. `npm run test:vet` verifies that the integration rejects real JavaScript violations, invalid syntax, unpinned actions, and empty input.

The pinned upstream runner discovers only TypeScript files. `scripts/vet.mjs` selects wheel's JavaScript and calls the upstream analyzer and workflow checker directly. It also runs Node's syntax check so invalid JavaScript cannot silently pass. The browser extension stays plain JavaScript with no build step. The test feed's script lives in `tests/feed.js` so it is checked too; HTML, CSS, and JSON are outside vet's JavaScript analysis.

See [vendor/README.md](vendor/README.md) for the exact upstream revision, license, archive checksum, and rebuild instructions. Rules beyond those listed above retain upstream defaults.
