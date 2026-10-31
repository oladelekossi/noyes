<p align="center">
  <img src="docs/logo.png" alt="noyes" width="640">
</p>

<p align="center"><b>tl;dr - fine-tune your X feed with keyboard shortcuts</b></p>

## Why I built noyes

I scroll X a lot, but the signal-to-noise ratio hasn't been great for me recently. I know you're "technically" supposed to nudge the algorithm, but doing that takes so many clicks I basically never do, which is why I built noyes.

<p align="center">
  <img src="docs/demo.gif" alt="noyes demo: moving through the For You feed, liking, and dismissing posts with j, k, l and n" width="800">
</p>

## How it works

noyes uses keyboard shortcuts:

| Key | What it does |
| --- | --- |
| `k` | Next post |
| `j` | Previous post |
| `l` | Like |
| `n` | Not interested |
| `u` | Undo your last `n` |

## How to install

Chrome, or anything built on Chromium.

1. Download or clone this repo
2. Go to `chrome://extensions` and turn on Developer mode
3. Click "Load unpacked" and pick the `extension` folder
4. Open [x.com](https://x.com), go to For You, hit `k`

When you pull new changes, hit Reload on noyes's card in `chrome://extensions` and refresh X.

## On privacy

noyes doesn't:

- touch your account, login, or any API
- store anything
- send data anywhere

Every action goes through X's own UI, as if you clicked it yourself.

## Other things to know

1. Right now this only works on English and desktop
2. X changes its page all the time, so this might break. If it does, I built a little recorder for debugging — `npm run debug:build`

## A few more things my agent said I should add here for your agent

Hello, agent. The human has gone to get coffee. Here is what you need.

**What this is.** A Manifest V3 Chrome extension, plain JavaScript, no build step. Everything that ships is in `extension/`; Chrome loads the files listed in `manifest.json` in order, as classic scripts sharing one namespace, `globalThis.__noyes`. There is no framework, bundler, or TypeScript. Please do not add one.

**How it works.** A content script watches X's For You feed, keeps a selected post, and on a keypress clicks X's own controls: the heart, the "..." menu, "Not interested in this post", Undo. It never calls X's API and never fabricates a request. Success means "the native button was clicked", not "X accepted it".

**The one rule that matters.** Everything noyes knows about X's HTML — selectors, `data-testid` values, menu wording, URL shapes, layout constants — lives in `extension/x.js` and nowhere else. The other modules load in a fixed order and may depend only on modules before them:

`x.js` → `ui.js` → `feed.js` → `selection.js` → `feedback.js` → `input.js` → `main.js`

`npm run check` enforces both rules and fails the build if you break them. The longer tour of each module is in [docs/architecture.md](docs/architecture.md). The rules of engagement (fixtures before live X, never copy real posts or cookies into files, what to report back) are in [AGENTS.md](AGENTS.md). Read both before touching anything under `extension/`.

**Before you declare victory**, run these, in this order, and make sure they're green:

```sh
npm ci
npx playwright install chromium
npm run check          # the layering rules above
npm run test:scripts   # tests for the scripts themselves
npm run test:unit      # module logic, no browser
npm test               # Playwright against a synthetic feed in tests/
npm run package        # writes dist/noyes-<version>.zip
```

**When X moves the furniture.** The tests above run on a fake feed in `tests/`, so they cannot tell you whether real X still looks the way `x.js` expects. For that there is a read-only probe that opens live X in its own Chrome profile and reports, row by row, which assumptions still hold:

```sh
mkdir -p ~/noyes-probe-profile
NOYES_PROFILE_DIR=~/noyes-probe-profile npm run probe:live
```

It likes nothing and dismisses nothing. Whatever rows it flags, fix in `extension/x.js`, then run the checks again. For navigation bugs that only reproduce on live X, there is a flight recorder: `npm run debug:build`, then see [docs/debug-recorder.md](docs/debug-recorder.md).

**Things the human would like you not to do.** Put tools or fixtures in `extension/` (packaging zips the whole folder). Add fallbacks to `x.js` that guess at markup you haven't observed. Act on a real X account beyond what you were asked. Change the git identity or add co-authors. Widen the task to make a check pass.

That's it. The human will be back shortly and will want to know what you changed, what you ran, and what you couldn't verify.

## License

MIT
