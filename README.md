# noyes

tl;dr — train your X feed from your keyboard

## Why I built this

I scroll X a lot, but the signal-to-noise ratio hasn't been great. I know you're "technically" supposed to nudge the algorithm, but doing that takes so many clicks I basically never did.

- There's too much slop.
- Training the algo takes way too many clicks.
- In short, I wanted a better signal-to-noise ratio.

## How it works

noyes uses your keyboard. A green outline shows which post you're on.

| Key | What it does |
| --- | --- |
| `k` | Next post |
| `j` | Previous post |
| `l` | Like |
| `n` | Not interested |
| `u` | Undo your last `n` |

Note: a thread (i.e. post and reply shown together) counts as one stop, and `l`/`n` act on the reply.

## Install

Chrome, or anything built on Chromium.

1. Download or clone this repo.
2. Go to `chrome://extensions` and turn on Developer mode.
3. Click "Load unpacked" and pick the `extension` folder.
4. Open [x.com](https://x.com), go to For You, hit `k`.

When you pull new changes, hit Reload on noyes's card in `chrome://extensions` and refresh X.

## Privacy

noyes doesn't:

- touch your account, login, or any API
- store anything
- send data anywhere
- ever swap in mute, block, report, or ad feedback for Not interested

Every action goes through X's own UI, as if you clicked it yourself.

## Other things to know

- Right now this only works on English and desktop.
- It's early, so expect bugs.
- X changes its page all the time, so this might break. If it does, I built a little flight recorder for debugging — `npm run debug:build` gives you a debug version of the extension that records your inputs and replays the bug offline (see [docs/debug-recorder.md](docs/debug-recorder.md)). [Open an issue](https://github.com/oladelekossi/noyes/issues) and attach the recording.

## A few other things my agent says I should put in here

- Everything that knows what X's page looks like lives in one file, `extension/x.js`. When X changes something, that's where the fix goes. `npm run check` makes sure no other file sneaks in X-specific selectors.
- `npm run probe:live` logs into X with a profile you give it and reports which of noyes's assumptions about the page still hold. Read-only, just counts and true/false.
- Linting is done with [vet](https://github.com/gdevillele/vet), pinned in `vendor/`. Rules are in `vet.yaml`.
- More detail in [docs/architecture.md](docs/architecture.md) and [docs/resilience-plan.md](docs/resilience-plan.md). If you're using a coding agent, point it at [AGENTS.md](AGENTS.md).

To run everything:

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:unit
npm test
npm run package      # builds dist/noyes-<version>.zip
```

## License

MIT. Not affiliated with X.
