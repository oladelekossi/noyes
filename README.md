<p align="center">
  <img src="docs/logo.png" alt="noyes" width="640">
</p>

<p align="center"><b>Fine-tune your X feed from your keyboard.</b></p>

## Why I built this

I scroll X a lot, but the signal-to-noise ratio hasn't been great for me. I know you're "technically" supposed to nudge the algorithm, but doing that takes so many clicks I basically never did, which is why I built noyes.

## How it works

noyes uses your keyboard. Here are the shortcuts:

| Key | What it does |
| --- | --- |
| `k` | Next post |
| `j` | Previous post |
| `l` | Like |
| `n` | Not interested |
| `u` | Undo your last `n` |

Note: a thread (i.e., post and reply coupled together) counts as one stop. `l`/`n` act on the reply.

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

Every action goes through X's own UI, as if you clicked it yourself.

## Other things to know

1. Right now this only works on English and desktop.
2. X changes its page all the time, so this might break. If it does, I built a little recorder for debugging — `npm run debug:build`

## Development

- Linting is done with [vet](https://github.com/gdevillele/vet), pinned in `vendor/`. Rules are in `vet.yaml`.
- How it works under the hood: [docs/architecture.md](docs/architecture.md). If you're using a coding agent, point it at [AGENTS.md](AGENTS.md).

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
