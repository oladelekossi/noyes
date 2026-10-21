# wheel

Fine-tune your X feed from the keyboard.

Move through **For You**, like posts, and send **Not interested** feedback. A green outline marks the selected post or connected conversation. X handles dismissal, confirmation, follow-up questions, and Undo.

No settings, accounts, API keys, build step, or automatic feed browsing. Contributors: see [AGENTS.md](AGENTS.md).

## Install locally

For Chrome and Chromium-based browsers:

1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the repository's **extension** folder.
4. Refresh X, open **For You**, and press `k` to select a post.

After changing extension files, click **Reload** on wheel's extension card and refresh each X tab where you use it.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `k` | Next post or conversation |
| `j` | Previous post or conversation |
| `l` | Like, then select the next post (never unlike) |
| `n` | Not interested, or skip when feedback is unavailable |
| `u` | Undo the latest `n` dismissal while X still offers Undo |

The first navigation key selects the first visible post. Navigation puts its top below the feed header and briefly corrects feed shifts. If an ad or gap fills the viewport, or there is no loaded neighboring post, each `j`/`k` press scrolls one screen in that direction so you can reach more posts. Loading alone never triggers another scroll. After you manually scroll past the selection, the next shortcut starts from the visible feed. `l` and `n` act only on a visible post; `l` advances past already-liked posts and stays put at the last loaded post.

Connected conversations form one navigation item. Their green outline spans the context and reply; likes and feedback target the last displayed reply. Grouping uses a shared feed cell or visible avatar connector, never mentions alone.

`n` advances when it clicks X's native feedback action. If that action is missing, it skips with a notice and leaves the post unchanged. `u` selects the restored post after using X's native Undo. It has no undo history, does not undo likes, and shows a notice when Undo is unavailable. During a pending `n`, `u` cancels that action instead.

## Limits and cancellation

- Supports X's **English desktop web interface** on `x.com` and `twitter.com`, only in **For You**. It does not modify the native phone app.
- Shortcuts stay inactive while typing or using a dialog/menu. Modifiers and held-key repeats do not trigger actions. wheel takes precedence over X's native shortcuts for these five keys in this context.
- No extra post buttons are added. A native menu may briefly appear during feedback; follow-up prompts stay under your control.
- Navigation, key presses, clicks elsewhere, scrolling, and touch cancel feedback that has not been dispatched. Cancellation does not advance selection or pull you back. wheel closes its own abandoned menu when it can identify it and preserves menus you open yourself.
- wheel never substitutes mute, block, report, or ad feedback for Not interested.
- X controls recommendation changes and can change its page structure or wording. wheel cannot guarantee compatibility or how much your recommendations change.

## Privacy

wheel runs only on X/Twitter pages and reads the displayed DOM to carry out your requested action. It has no analytics, storage, backend, external requests, or third-party runtime dependencies. Feedback uses X's own interface.

## Development

Requires Git, Node.js 20+, npm, and `zip`.

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:vet
npm test
npm run package
```

Packaging writes `dist/wheel-<version>.zip` using the manifest version and only the files in `extension/`. Extract the ZIP before using Load unpacked.

Browser tests cover navigation, actions, Undo, cancellation, recycled posts, typing protection, and appearance on a synthetic feed. An isolated Chromium test verifies extension injection. No tests submit feedback on a real X account.

Set `WHEEL_CHROMIUM_EXECUTABLE` to a Chromium or Chrome for Testing executable for the extension-loading test if needed. Regular Chrome releases may not permit command-line extension loading.

Live installation and sampled navigation have been verified. Live like/feedback dispatch and automatic advancement remain unverified; see [architecture and evidence limits](docs/architecture.md#verification-limits).

## Code quality with vet

`npm run check` runs [vet](https://github.com/gdevillele/vet) on tracked or unignored JavaScript and GitHub workflows. It enforces one function parameter (use a named options object), Prettier formatting, and full commit SHA pins for external Actions. Generated output and dependencies are ignored by Git.

- `npm run format`: fix formatting.
- `npm run vet:all`: all diagnostics as JSON.
- `npm run vet -- extension/content.js`: check one file.
- `npm run test:vet`: test the adapter's handling of violations, syntax errors, unpinned Actions, and empty input.

The adapter selects JavaScript files because upstream discovery only finds TypeScript, and runs Node syntax checks before analysis. HTML, CSS, and JSON are outside vet's JavaScript analysis. See [vendor/README.md](vendor/README.md) for the pinned revision, license, checksum, and rebuild instructions; [vet.yaml](vet.yaml) defines enabled rules.
