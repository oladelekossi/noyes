# Working on noyes

noyes is a plain JavaScript browser extension for keyboard feedback on X's English For You feed. Installable files live in `extension/`; there is no application build step.

## References

- [README.md](README.md): supported behavior and installation.
- [CONTRIBUTING.md](CONTRIBUTING.md): development setup, checks, and the vet adapter.
- [docs/architecture.md](docs/architecture.md): read before changing selection, shortcuts, native feedback, or packaging.
- [docs/resilience-plan.md](docs/resilience-plan.md): the completed plan behind the layered modules, with the inventory of X assumptions and the degradation matrix; read before changing how noyes finds anything on X's page.
- [vendor/README.md](vendor/README.md): pinned vet dependency provenance and rebuild instructions.
- [package.json](package.json), [vet.yaml](vet.yaml), and [.github/workflows/test.yml](.github/workflows/test.yml): executable checks, rules, and CI setup.

## Constraints

- Keep changes within the user's task and preserve unrelated working-tree edits.
- Keep tools and test data outside `extension/`; packaging includes its files.
- Only `extension/x.js` may contain X selectors, labels, or URL shapes, and modules depend only on those before them in the manifest; `npm run check` enforces both.
- Use synthetic posts in fixtures. Never copy cookies, tokens, or private feed content into files or reports.
- Validate interaction changes with fixtures first. Report live X verification separately; perform account actions only within the user's requested scope.
- Commit under the Git identity configured in the checkout; do not change it or add other authors.
- Use the npm scripts for checks and packaging. Report documentation/behavior discrepancies; fix only those within the task's scope.

## Verification and completion

Run from the repository root with Git, Node.js 20+, npm, `zip`, installed development dependencies, and a compatible Playwright browser. See [development setup](CONTRIBUTING.md#development).

Runtime or tooling changes must pass:

```sh
npm run check
npm run test:vet
npm run test:unit
npm test
npm run package
```

`check` runs vet then the layer checker; each reports exit 1 for rule violations and exit 2 for setup, syntax, or input errors; use `npm run vet:all` for all diagnostics. Browser failure artifacts are in `test-results/`. Packaging prints a versioned ZIP path under `dist/`.

For documentation-only changes, check links, stated behavior, and any added commands. Local checks need no X login or GitHub credentials; GitHub operations use the host's authenticated account, while CI uses its Actions token.

On failure, check the working directory and prerequisites once. After a relevant fix, allow at most **two retries for the same failure**. If it persists, report the command and error, then continue independent work. Do not install unrelated tools or expand scope to make checks pass.

Live X checks are separate from the required sequence: `npm run probe:live` (read-only; needs `NOYES_PROFILE_DIR`, see CONTRIBUTING.md) reports which X assumptions still hold. Run it only when the user asks or for a release, and report its row results (counts and booleans only).

Report changed files, checks and results, and unverified live behavior. If nothing changed, say so and give the evidence.
