# noyes

Fine-tune your X feed from the keyboard. `j`/`k` to move, `l` to like, `n` for Not interested, `u` to undo.

## What this does

X's **For You** feed learns from what you like and what you dismiss, but teaching it means a lot of mouse travel through tiny menus. noyes turns that into five keys. A green outline marks the selected post; every action clicks X's own controls, so X still handles the confirmation, the follow-up question, and Undo.

**Key features**

- **Vim-style navigation.** `j` and `k` walk the feed one post at a time, keeping the selected post just under the header.
- **One-key feedback.** `l` likes and advances; `n` sends Not interested and advances.
- **Conversations as one unit.** A connected thread is a single stop; likes and feedback go to the last visible reply.
- **Undo that uses X's undo.** `u` restores the last dismissal; `j` restores a dismissed post when you back into it.
- **Fails closed.** If X changes its page, noyes tells you once and does nothing rather than clicking the wrong thing.
- **Nothing else.** No settings, accounts, API keys, build step, analytics, storage, network requests, or automatic browsing.

> **Status:** early release. Navigation and selection are verified on live X; like and Not-interested dispatch are tested against a synthetic feed. X can change its page at any time and break noyes until it is updated — please [report breakage](https://github.com/oladelekossi/noyes/issues).

## Installation

Chrome and Chromium-based browsers:

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the repository's `extension` folder.
4. Open [x.com](https://x.com), go to **For You**, and press `k`.

To update, pull the latest changes, click **Reload** on noyes's card in `chrome://extensions`, and refresh X.

## Usage

| Key | Action |
| --- | --- |
| `k` | Next post or conversation |
| `j` | Previous post or conversation (restores a dismissed one if you back into it) |
| `l` | Like, then move to the next post. Never unlikes. |
| `n` | Not interested, then move to the next post. Skips with a notice if X offers no feedback action. |
| `u` | Undo the latest `n`, while X still offers Undo |

Good to know:

- The first navigation key selects the first visible post. If you scroll away by hand, the next key starts from what's on screen.
- When an ad or empty gap fills the screen, or there is no loaded post in that direction, `j`/`k` scroll one screen instead.
- `l` and `n` act only on a visible post. `l` steps past posts you already liked.
- `j` restores a dismissed post only while X's own Undo for it is still available and unambiguous; otherwise it shows `Undo unavailable.` and keeps moving.
- `u` targets only the most recent successful `n`, once. During a pending `n`, `u` cancels it instead.
- Shortcuts are off while you type or while a dialog or menu is open. Modifier combinations and held-key repeats do nothing. For these five keys, noyes takes precedence over X's native shortcuts on For You.
- Pressing another key, clicking, scrolling, or touching cancels a feedback action that has not yet been sent. noyes closes its own abandoned menu and leaves menus you opened alone.
- noyes never substitutes mute, block, report, or ad feedback for Not interested.

## Limits

- English desktop web interface only, on `x.com` and `twitter.com`, and only in **For You**.
- X controls what recommendations change and how. noyes can only send the same signals you could send by hand.
- X can change its page structure or wording at any time. When that happens, noyes shows one notice and its shortcuts do nothing until it is updated.

## Privacy

noyes runs only on X pages and reads the page in front of you to carry out the action you asked for. It has no analytics, storage, backend, external requests, or third-party runtime code. Feedback goes through X's own interface, exactly as if you had clicked it.

## Architecture

Plain JavaScript, Manifest V3, no build step. The content scripts load in this order and each may depend only on the ones above it:

| File | Purpose |
| --- | --- |
| `extension/x.js` | The X adapter: the only file that knows what X's page looks like. When X changes, the fix goes here. |
| `extension/ui.js` | noyes's own UI: the transient notice and layout CSS variables. |
| `extension/feed.js` | The feed model: posts and conversations as navigation items; ads and dismissed posts are not items. |
| `extension/selection.js` | Which item is selected, its outline, and the align/settle step that keeps it under X's header. |
| `extension/feedback.js` | Like, dismiss, and undo by clicking X's native controls. Never hides a post locally and pretends. |
| `extension/input.js` | Turns keyboard, wheel, touch, and pointer events into commands and interrupts. |
| `extension/main.js` | Starts everything once per page and watches for X's layout drifting away. |
| `extension/content.css` | The outline and notice styles. |

`npm run check` enforces the one-way layering and that only `x.js` contains X selectors, labels, or URL shapes. [docs/architecture.md](docs/architecture.md) has the full picture; [docs/resilience-plan.md](docs/resilience-plan.md) lists every assumption noyes makes about X's page and what happens when each one breaks.

## Philosophy

1. **Click what the user would click.** noyes only presses X's own controls, matched exactly. Never the first menu item, never a guess from an icon or position.
2. **Fail closed.** When something on the page is unrecognizable, do nothing and say so. Never act on the wrong post.
3. **One file knows about X.** Everything X-specific lives in `x.js`, so a page change is a data fix, not a rewrite.
4. **No surprises.** No hidden state, no local hiding of posts, no network, no automation beyond the key you pressed.

## Development

Requires Git, Node.js 20+, npm, and `zip`.

```sh
npm ci
npx playwright install chromium
npm run check        # lint (vet) and module layering
npm run test:vet     # tests for the lint adapter
npm run test:unit    # feed grouping, feedback state machine, shortcut gating
npm test             # Playwright suite on a synthetic feed
npm run package      # writes dist/noyes-<version>.zip from extension/
```

No test touches a real X account. Set `NOYES_CHROMIUM_EXECUTABLE` to a Chromium or Chrome for Testing binary if the extension-loading test needs it; regular Chrome may refuse command-line extension loading.

**Debugging a navigation bug.** `npm run debug:build` makes a separate, opt-in debug extension with an input/state flight recorder and an offline replay. It records no post content. See [docs/debug-recorder.md](docs/debug-recorder.md).

**Checking whether X changed.** `NOYES_PROFILE_DIR=~/noyes-probe-profile npm run probe:live` runs a read-only probe against live X with a logged-in profile (create the directory first; the first run asks you to log in). It prints counts and booleans per assumption and names any that failed.

`npm run check` uses [vet](https://github.com/gdevillele/vet), pinned in `vendor/` (see [vendor/README.md](vendor/README.md)); `vet.yaml` holds the rules. Coding agents should read [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE). Use it, change it, share it. noyes is not affiliated with or endorsed by X Corp.
