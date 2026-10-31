# noyes

Train your X feed from the keyboard. `j`/`k` to move, `l` to like, `n` for Not interested, `u` to undo.

## Why I built this

I scroll X a lot, and it never felt like the feed was learning from me. The For You algorithm does respond to likes and Not interested, but actually giving it that feedback is tedious enough that almost nobody does it. So the feed stays noisy. noyes exists to fix three things:

- **Too much slop.** The default feed is full of posts I never asked for and would never choose. I wanted a way to push back on each one in a fraction of a second.
- **Too many clicks to train it.** Telling X "Not interested" means finding a tiny menu in the corner of a post, opening it, and picking the right line. That is three or four precise clicks per post. noyes makes it one key.
- **Signal over noise.** The goal is a curated feed: more of what is useful and interesting, less of everything else. The more cheaply you can say yes and no, the faster the feed converges on what you actually want.

Nothing here is new behavior on X's side. noyes just presses the same controls you would click, so X still handles the confirmation, the follow-up question, and Undo. It only removes the friction.

## How it works

Everything runs off the keyboard while you're on **For You**. A green outline shows which post you're on.

| Key | Action |
| --- | --- |
| `k` | Next post or conversation |
| `j` | Previous post or conversation (restores a dismissed one if you back into it) |
| `l` | Like, then move to the next post. Never unlikes. |
| `n` | Not interested, then move to the next post. Skips with a notice if X offers no feedback action. |
| `u` | Undo the latest `n`, while X still offers Undo |

A connected conversation counts as one stop; likes and feedback go to the last visible reply. Keys are off while you're typing or while a dialog or menu is open, and pressing another key, clicking, or scrolling cancels a dismissal that hasn't gone out yet.

## Install

Works in Chrome and other Chromium-based browsers.

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the repository's `extension` folder.
4. Open [x.com](https://x.com), go to **For You**, and press `k`.

To update, pull the latest changes, click **Reload** on noyes's card in `chrome://extensions`, and refresh X.

## Privacy

noyes runs only on X pages and reads the page in front of you to carry out the action you asked for. It does not:

- access your account, credentials, or API
- store anything, on your machine or anywhere else
- send any data anywhere; there is no server and no analytics
- include third-party code at runtime
- browse, like, or dismiss anything on its own; nothing happens without a keypress
- send mute, block, report, or ad feedback in place of Not interested

Feedback goes through X's own interface, exactly as if you had clicked it.

## Things to know

- English desktop web interface only, on `x.com` and `twitter.com`, and only in **For You**.
- Early release. Navigation and selection are verified on live X; like and Not-interested dispatch are tested against a synthetic feed.
- X can change its page at any time. When noyes no longer recognizes posts, it shows one notice and its keys do nothing until it is updated, rather than guessing and clicking the wrong thing. Please [report breakage](https://github.com/oladelekossi/noyes/issues).
- X decides what the feed learns from a signal. noyes can only send the signals you could send yourself.

## Under the hood

Plain JavaScript, Manifest V3, no build step. A few things worth knowing if you want to poke at it:

- **One file knows about X.** All of X's selectors, labels, and URL shapes live in `extension/x.js`. When X changes its page, the fix is a data edit there, not a rewrite. `npm run check` enforces this and the one-way layering between modules.
- **A live probe for drift.** `npm run probe:live` is a read-only check that runs against live X with a logged-in profile and reports which assumptions about X's page still hold, as counts and booleans, never post content. Run it when something breaks or before a release.
- **A flight recorder for bugs.** `npm run debug:build` makes a separate, opt-in debug extension that records inputs and state (no post content) and replays them offline. See [docs/debug-recorder.md](docs/debug-recorder.md).
- **vet.** Linting runs on [vet](https://github.com/gdevillele/vet), pinned in `vendor/`, with rules in `vet.yaml`: one named-options parameter per function, Prettier formatting, and SHA-pinned GitHub Actions.

```sh
npm ci
npx playwright install chromium
npm run check        # lint and module layering
npm run test:unit    # feed grouping, feedback state machine, shortcut gating
npm test             # Playwright suite on a synthetic feed
npm run package      # writes dist/noyes-<version>.zip from extension/
```

No test touches a real X account. More in [docs/architecture.md](docs/architecture.md) and [docs/resilience-plan.md](docs/resilience-plan.md). Coding agents should read [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE). noyes is not affiliated with or endorsed by X Corp.
