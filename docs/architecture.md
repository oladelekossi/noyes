# How wheel works

wheel turns a user-selected post into a native X like or Not interested action. It currently consists of a Manifest V3 content script and CSS, with synthetic browser tests and a separate development-time vet integration.

The supported user behavior and key mapping live in [README.md](../README.md#keyboard-shortcuts). This document explains implementation boundaries; it does not authorize additional features or live account actions.

## Where to work

- `extension/`: shipped manifest, DOM interaction code, and visual styles.
- `tests/`: synthetic feed, fixture assembly, browser behavior tests, and real extension-loading smoke test.
- `scripts/`: ZIP packaging, vet adapter, and adapter regression tests.
- `vendor/`: the pinned upstream vet package and its provenance; development-time only.
- `.github/workflows/`: checks, browser setup, and artifact upload in CI.

## Loading and selection

`extension/manifest.json` injects `content.js` and `content.css` on HTTPS `x.com` and `twitter.com`. The script registers capture-phase keyboard listeners at `document_start`, before X's page handlers. DOM observation starts once the document is ready. A per-page guard prevents duplicate initialization.

The runtime enables feed controls only on `/home` with the visible English `For you` tab selected inside `primaryColumn`. It identifies posts by `article[data-testid="tweet"]` and reads the numeric status ID from the link wrapping the post's timestamp. Missing IDs or missing expected controls prevent the relevant action.

Selection stores both a DOM element and its status ID. Buttons carry the same ID in `data-post-key`. X can recycle DOM nodes, so the ID must still match before feedback is dispatched. Nested article posts and recognized promoted-post markers are excluded.

Navigation uses DOM order without wrapping. The first navigation selects the first post intersecting the usable viewport. Once selected, navigation scrolls the chosen post into view. If manual scrolling leaves the old selection offscreen, the next action starts with a visible post. `.wheel-selected` supplies the orange marker.

A MutationObserver batches refreshes through animation frames. A one-second refresh also catches URL changes that reuse the DOM. There is no autonomous scrolling or background feed curation.

## Dispatching feedback

A like targets only the native `data-testid="like"` control. It never invokes the unlike control. A short in-memory set prevents duplicate like requests while the native state updates.

Not interested is serialized through `busy` and an AbortController:

1. Record the post ID and existing menus, then click that post's native caret.
2. Wait for a newly created visible menu; do not reuse an already-open menu.
3. Match only the normalized labels `not interested in this post` or `not interested in this tweet`.
4. Recheck the post ID, page, connection, and cancellation state before clicking.
5. Leave X in charge of removal, confirmation, follow-up prompts, and Undo.

Each menu lookup has a 1,600 ms deadline and polls every 40 ms. There is no automatic action retry. Cancellation stops a pending lookup; missing feedback leaves the post unchanged and shows a notice. Native menus are left for the user to inspect or close on failure.

After a successful keyboard dismissal, selection prefers the captured next neighbor, then the previous neighbor when no next neighbor remains; it clears if neither is usable. Mouse-button dismissal does not explicitly advance selection. Success here means the native control was clicked, not that X's server accepted feedback or changed future recommendations.

The shortcut handler ignores typing targets, composition events, modifier keys, repeated keydown events, and ordinary menus/dialogs. During wheel's own pending feedback, navigation can cancel the wait; additional like/dismiss keys are consumed without another action. Consumed keys' keypress/keyup events are also intercepted to avoid native X shortcut conflicts.

## Data and artifacts

The runtime's input is the displayed DOM plus the user's click or keystroke. Post IDs connect selection, injected buttons, and pending feedback; DOM position alone is not an identity. The live DOM wins over cached state when a post changes.

Runtime output is an injected control, selection marker, transient notice, or native UI action. State is in memory for the page lifetime. The extension has no storage, analytics, credentials, backend, or direct network client. X owns any requests resulting from its native controls.

The package script reads the release version from `extension/manifest.json` and writes `dist/wheel-<version>.zip`. A rerun replaces that version's ZIP; ZIPs for other versions remain. It includes all top-level files in `extension/`, not an explicit file allowlist. Keeping unrelated files out of that directory is a contributor convention, not a packaging safeguard.

`tests/feed.js` defines synthetic post records with a required `id`; text, name, and handle have defaults. The fixture uses the ID in its status URL and action log. `tests/fixture.mjs` embeds that script in `tests/feed.html` for routed browser tests; the direct HTML fixture can load it as a separate script.

## Quality checks and evidence limits

The agent verification entry point is [AGENTS.md](../AGENTS.md#verification-and-completion). The README owns setup and command usage; package scripts and the workflow define what actually runs.

The vet adapter supplies JavaScript text directly to the upstream analyzer because upstream discovery skips JavaScript files. Git's tracked and unignored file list supplies default inputs. Node syntax checking runs before analysis so invalid JavaScript cannot silently pass formatting. `vet.yaml` controls enabled rules. No TypeScript migration or runtime dependency is implied.

Browser tests run against a simulated X page. The extension smoke test loads the manifest and content script in an isolated Chromium profile, but still serves the simulated page. Passing either does not prove the current signed-in X DOM, recommendation effects, or every localization works.

Live compatibility is unverified. Expansion beyond the English desktop web experience—including native mobile support, other locales, settings, backend services, and AI filtering—is **undecided**. None of these features exists today; this document does not request their implementation.
