# Working on noyes

noyes is a plain-JavaScript Chrome extension (Manifest V3, no build step) that turns keystrokes into native actions on X's English For You feed. Everything that ships lives in `extension/`.

## Read first

- [README.md](README.md): what noyes does, the shortcuts, install, and the dev commands.
- [docs/architecture.md](docs/architecture.md): module layout, the X adapter, how selection and feedback work, and what breaks when X changes. Read it before touching selection, shortcuts, native feedback, packaging, or anything that finds elements on X's page.
- [docs/debug-recorder.md](docs/debug-recorder.md): the development-only flight recorder, for navigation bugs that only show up on live X.

## Rules

- **Only `extension/x.js` knows about X.** Selectors, labels, URL shapes, and layout constants go there and nowhere else.
- **Modules depend one way.** A file may use only the modules loaded before it in `manifest.json`'s `js` array. `npm run check` enforces this and the rule above.
- **Nothing extra in `extension/`.** Packaging zips every top-level file there, so tools, fixtures, and docs live elsewhere.
- **Synthetic data only.** Fixtures use made-up posts. Never copy cookies, tokens, handles, or real feed content into files, tests, or reports.
- **Fixtures before live X.** Validate behavior changes against the synthetic feed first. Only act on a real X account within what the user asked for, and report live results separately from test results.
- Stay within the task. Leave unrelated working-tree edits alone, and report doc/behavior mismatches you notice rather than fixing them unasked.

## Checks

Needs Node 20+, npm, `zip`, and a Playwright Chromium (`npx playwright install chromium`).

Any change to runtime code or tooling must pass, in this order:

```sh
npm run check         # layer rules
npm run test:scripts  # tests for the scripts themselves
npm run test:unit     # module logic, no browser
npm test              # Playwright, synthetic feed
npm run package       # writes dist/noyes-<version>.zip
```

For docs-only changes: check that links resolve and that any commands you mention exist.

If a check fails, look at the working directory and prerequisites once, fix, and retry at most twice for the same failure. If it still fails, report the command and error and move on to independent work. Don't install unrelated tools or widen scope to get green. Browser failure artifacts land in `test-results/`.

`npm run probe:live` is separate: a read-only check of which X assumptions still hold on the live site (needs `NOYES_PROFILE_DIR`, see README). Run it only when asked or before a release, and report its rows as counts and booleans.

## When you're done

Say what files changed, which checks ran and their results, and what you could not verify (live X behavior, usually). If nothing changed, say so and why.
