# Working on wheel

wheel is a browser extension for keyboard-driven feedback on X's English For You feed. The installable code is plain JavaScript in `extension/`; there is no application build step.

This is a tool-neutral agent entry point. Keep it within **100 lines**; move detail to linked documents. The line budget is a documentation convention, not a CI-enforced rule.

## Read when needed

- [README.md](README.md): read for supported behavior, local installation, setup, and the existing command reference.
- [docs/architecture.md](docs/architecture.md): read before changing selection, shortcuts, native feedback, or packaging.
- [vendor/README.md](vendor/README.md): read before updating the pinned vet dependency; it owns provenance and rebuild instructions.
- [package.json](package.json): authoritative list of npm scripts and development dependencies.
- [vet.yaml](vet.yaml): authoritative enabled quality rules; the adapter is `scripts/vet.mjs`.
- [.github/workflows/test.yml](.github/workflows/test.yml): authoritative CI setup and execution order.

## Scope and working defaults

- Follow the user's current task over these defaults. Change only the requested component and its relevant docs or tests; preserve unrelated working-tree changes. Existing TODOs and uncommitted files are background, not additional tasks.
- Keep development tools and test data outside `extension/`: the packaging script includes that directory's files in the shipped ZIP.
- Use synthetic posts in fixtures. Do not copy cookies, tokens, or private feed content into files or reports; those are unnecessary for the local tests.
- Validate interaction changes with fixtures first. Tests do not establish live X compatibility; report live verification separately and only perform account actions within the user's requested scope.
- Commit under the Git identity configured in the checkout; do not change it or add other authors.
- Use the npm scripts for their checks and packaging rather than recreating their steps by hand; the scripts and CI are the executable procedure.
- If documentation and executable behavior disagree, report the discrepancy. Fix it only within the task's scope; do not build a feature merely because a document mentions it.

## Verification and completion

Run from the repository root, the directory containing `package.json`. Prerequisites are Git, Node.js 20 or newer, npm, the `zip` executable, installed development dependencies, and a compatible Playwright browser. Setup and the existing-browser override are in [README.md](README.md#development).

For runtime or tooling changes, completion means these commands pass. For documentation-only work, verify any commands added to the documentation and check its links and stated behavior; do not introduce unrelated code changes to make a check pass.

| Command | Success | Failure |
| --- | --- | --- |
| `npm run check` | Exit 0; vet reports files checked and no violations. | Exit 1 for a rule violation; exit 2 for setup, syntax, or input errors. Text reports only the first sorted diagnostic; the full-diagnostic command is in the README. |
| `npm run test:vet` | Exit 0; all adapter tests pass. | Nonzero; inspect the named failing test or setup error. |
| `npm test` | Exit 0; all browser tests pass. | Nonzero; inspect the failed case and `test-results/` artifacts. |
| `npm run package` | Exit 0; prints the versioned ZIP path under `dist/`. | Nonzero; inspect the packaging error and prerequisites. |

Local checks require no X login or GitHub credentials. Local GitHub operations use the host's authenticated account; CI uses its GitHub Actions token for repository and artifact access. Neither environment needs X credentials for these tests.

If a command fails, check its working directory and prerequisites once. After a relevant fix, allow at most **two retries for the same failure** as an operating default, not project policy. If it persists, stop retrying that step, report the command and error, and continue independent work. Do not install unrelated tooling or edit outside the task to make a green result.

Report files changed, commands and results, and any unverified live behavior. On failure, include the exact command and remaining cause. If nothing changed, say so and give the evidence; do not create an empty change just to record activity.
