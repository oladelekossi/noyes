# noyes

tl;dr — train your X feed from your keyboard.

## Why I built this

I scroll X a lot. And for a long time it felt like the feed just wasn't learning from me. It technically does — every like and every "Not interested" nudges the algorithm — but actually telling it anything is such a pain that I basically never did. So the feed stayed noisy and I kept scrolling past the same junk.

A few things were bugging me:

- There's a lot of slop. Stuff I didn't ask for and would never pick on my own, over and over.
- Training the feed takes way too many clicks. To say "Not interested" you have to find the little menu in the corner of the post, open it, read the options, click the right one. Nobody does that fifty times in a row.
- I wanted a better signal-to-noise ratio. Less filler, more of the stuff that's actually useful or interesting. A feed that feels curated rather than dumped on me.

So noyes turns all of that into a handful of keys. You can move through the feed and say yes or no to each post about as fast as you can read it. It doesn't do anything clever on X's side — it just clicks the same buttons you would, so X still shows its confirmation, asks its follow-up question, and offers Undo like normal. It just takes the friction out.

## How it works

It's all keyboard, on the **For You** tab. A green outline shows which post you're on.

| Key | What it does |
| --- | --- |
| `k` | Next post |
| `j` | Previous post (if you back into one you dismissed, it brings it back) |
| `l` | Like it and move on. Never unlikes. |
| `n` | Not interested, and move on. If X doesn't offer that option on a post, it skips and tells you. |
| `u` | Undo your last `n`, as long as X still has the Undo button up |

A thread (post + reply shown together) counts as one stop, and `l`/`n` act on the reply. The keys turn off while you're typing or have a menu open, and if you click or scroll while an `n` is still going out, it cancels.

## Install

Chrome, or anything built on Chromium.

1. Download or clone this repo.
2. Go to `chrome://extensions` and turn on Developer mode.
3. Click "Load unpacked" and pick the `extension` folder.
4. Open [x.com](https://x.com), go to For You, hit `k`.

When you pull new changes, hit Reload on noyes's card in `chrome://extensions` and refresh X.

## Privacy

noyes only runs on X pages, and all it does is read the page you're looking at so it can click the right thing. It doesn't:

- touch your account, login, or any API
- store anything, anywhere
- send data anywhere — there's no server, no analytics
- load any third-party code
- do anything on its own. Nothing happens unless you press a key.
- ever swap in mute, block, report, or ad feedback for Not interested

Every action goes through X's own UI, exactly as if you'd clicked it yourself.

## Things to know

- English, desktop, `x.com` / `twitter.com`, For You tab only.
- It's early. Moving around and selecting posts is verified on live X. Likes and Not interested are tested against a fake feed, not a live one.
- X changes its page whenever it wants. If noyes stops recognizing posts, it shows you one notice and then does nothing until it's updated — I'd rather it do nothing than click the wrong thing. If you hit that, [open an issue](https://github.com/oladelekossi/noyes/issues).
- What the feed actually learns from a like or a dismissal is up to X. noyes can only send the same signals you could send by hand.

## A few other things in here

Plain JavaScript, Manifest V3, no build step. Some stuff that's worth knowing if you want to poke around:

- Everything that knows what X's page looks like lives in one file, `extension/x.js`. When X changes something, that's where the fix goes. There's a check (`npm run check`) that makes sure no other file sneaks in X-specific selectors.
- There's a live probe, `npm run probe:live`, that logs into X with a profile you give it and reports which of noyes's assumptions about the page still hold. Read-only, just counts and true/false — never post content. Useful when something breaks or before a release.
- There's a flight recorder for debugging. `npm run debug:build` makes a separate debug version of the extension that records your inputs and the extension's state (no post content) so you can replay a bug offline. See [docs/debug-recorder.md](docs/debug-recorder.md).
- Linting is done with [vet](https://github.com/gdevillele/vet), pinned in `vendor/`. Rules are in `vet.yaml`.

To run everything:

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:unit
npm test
npm run package      # builds dist/noyes-<version>.zip
```

None of the tests touch a real X account. More detail in [docs/architecture.md](docs/architecture.md) and [docs/resilience-plan.md](docs/resilience-plan.md). If you're using a coding agent, point it at [AGENTS.md](AGENTS.md).

## License

MIT. Not affiliated with X.
