<p align="center">
  <img src="docs/logo.png" alt="noyes" width="640">
</p>

<p align="center"><b>tl;dr - fine-tune your X feed with keyboard shortcuts</b></p>

<p align="center">
  <img src="docs/demo.gif" alt="noyes demo: moving through the For You feed, liking, and dismissing posts with j, k, l and n" width="800">
</p>

## Why I built noyes

I scroll X a lot, but the signal-to-noise ratio hasn't been great for me recently. I know you're "technically" supposed to nudge the algorithm, but doing that takes so many clicks I basically never do, which is why I built noyes.

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

## A few more things my agent said I should add here

Under the hood:

- noyes is a plain JavaScript content script. No build step, no framework — the files in `extension/` are exactly what Chrome runs.
- It never calls X's API. It finds the post you've selected on the page and clicks X's own buttons (the heart, the "..." menu, "Not interested"), the same way you would.
- To find those buttons it looks for X's HTML: things like the `article` element that wraps each post, the `data-testid="like"` attribute on the heart, the exact text "Not interested in this post" in the menu. All of that lives in one file, `extension/x.js`, so when X changes something there's one place to fix.
- If it can't find what it expects, it does nothing and shows you a small notice, rather than clicking the wrong thing.
- The longer version is in [docs/architecture.md](docs/architecture.md). If you're using a coding agent on this repo, point it at [AGENTS.md](AGENTS.md).

To run the checks and tests:

```sh
npm ci
npx playwright install chromium
npm run check        # module layering rules
npm run test:scripts
npm run test:unit
npm test
npm run package      # builds dist/noyes-<version>.zip
```

On X breaking things:

- X changes its HTML often — a renamed `data-testid`, a reworded menu item, a new wrapper element. When that happens noyes stops recognizing posts or buttons, even though nothing in noyes changed.
- The tests above run against a fake feed, so they can't tell you about this. For that there's a probe that opens real X and reports, row by row, which of noyes's assumptions still hold (does the post selector match, is the like button where we think, does the menu say what we expect, and so on). It only reads; it never likes or dismisses anything.
- It needs its own Chrome profile so it can stay logged in without touching your main one. Create one and point it there:

```sh
mkdir -p ~/noyes-probe-profile
NOYES_PROFILE_DIR=~/noyes-probe-profile npm run probe:live
```

- Whatever rows it flags, fix in `extension/x.js`.

## License

MIT
