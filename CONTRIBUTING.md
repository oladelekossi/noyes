# Contributing to noyes

noyes is plain JavaScript with no application build step; the installable files live in `extension/`. Bug reports, fixes, and compatibility updates when X changes its page are all welcome.

## Reporting a bug

Open an issue with your browser version, what you pressed, and what happened. For disappearing outlines or navigation jumps, attach a flight-recorder export (see [Recording a navigation bug](docs/debug-recorder.md)); it contains no post content. Never paste cookies, tokens, or private feed content into an issue.

## Pull requests

- Keep `extension/x.js` the only file with X selectors, labels, or URL shapes; `npm run check` enforces this and the module layering. Read [docs/architecture.md](docs/architecture.md) before changing selection, shortcuts, native feedback, or packaging.
- Use synthetic posts in fixtures. No test may submit feedback on a real X account.
- Run the full check sequence below before opening a PR; CI runs the same commands.
- Commit under your own Git identity. By contributing you agree your work is licensed under the repository's [MIT License](LICENSE).

If you work with a coding agent, point it at [AGENTS.md](AGENTS.md).

## Development

Requires Git, Node.js 20+, npm, and `zip`.

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:vet
npm run test:unit
npm test
npm run package
```

Packaging writes `dist/noyes-<version>.zip` using the manifest version and only the files in `extension/`. Extract the ZIP before using Load unpacked.

Unit tests (`npm run test:unit`) cover feed grouping, the feedback state machine, and shortcut gating without a browser. Browser tests cover navigation, actions, Undo, cancellation, recycled posts, typing protection, and appearance on a synthetic feed. An isolated Chromium test verifies extension injection. No tests submit feedback on a real X account.

Set `NOYES_CHROMIUM_EXECUTABLE` to a Chromium or Chrome for Testing executable for the extension-loading test if needed. Regular Chrome releases may not permit command-line extension loading.

For disappearing outlines or navigation jumps, run `npm run debug:build` and follow [Recording a navigation bug](docs/debug-recorder.md). This creates a separate, opt-in debug extension with ordered input/state recording and an offline visual replay; it saves no post content. The normal extension and ZIP do not include it.

Before a release, or when a user reports breakage, run the read-only live probe with a logged-in profile: `NOYES_PROFILE_DIR=~/noyes-probe-profile npm run probe:live` (create the directory first; the first run asks you to log in). It prints counts and booleans per X assumption, never post content, and exits 1 naming the failing rows of [the adapter inventory](docs/resilience-plan.md#21-inventory-of-x-assumptions-in-contentjs).

Live installation and sampled navigation have been verified. Live like/feedback dispatch and automatic advancement remain unverified; see [architecture and evidence limits](docs/architecture.md#verification-limits).

## Code quality with vet

`npm run check` runs [vet](https://github.com/gdevillele/vet) on tracked or unignored JavaScript and GitHub workflows. It enforces one function parameter (use a named options object), Prettier formatting, and full commit SHA pins for external Actions. Generated output and dependencies are ignored by Git.

- `npm run format`: fix formatting.
- `npm run vet:all`: all diagnostics as JSON.
- `npm run vet -- extension/x.js`: check one file.
- `npm run test:vet`: test the adapter's handling of violations, syntax errors, unpinned Actions, and empty input.

The adapter selects JavaScript files because upstream discovery only finds TypeScript, and runs Node syntax checks before analysis. HTML, CSS, and JSON are outside vet's JavaScript analysis. See [vendor/README.md](vendor/README.md) for the pinned revision, license, checksum, and rebuild instructions; [vet.yaml](vet.yaml) defines enabled rules.
