# How noyes works

noyes is a Manifest V3 content script and CSS that turns keyboard input into native X actions. [README.md](../README.md#keyboard-shortcuts) defines supported behavior and shortcuts.

## Layout and loading

- `extension/`: shipped manifest, the content-script modules below, and styles.
- `tests/`: synthetic feed, browser tests by module, the extension-loading smoke test, and `tests/unit/` for logic tests without a browser.
- `scripts/`: packaging, the vet adapter, the layer checker, the live probe, and their tests.
- `debug/`: development-only recorder and offline report template; `npm run debug:build` copies these into a separate extension under `dist/noyes-debug`. See [Recording a navigation bug](debug-recorder.md) for recording semantics and limits.
- `vendor/`: pinned development-only vet dependency and provenance.
- `.github/workflows/`: CI checks and artifacts.

The manifest injects on HTTPS `x.com` and `twitter.com`. Chrome runs the files in the manifest's `js` array in order, as classic scripts sharing one isolated world; they share state only through one namespace object, `globalThis.__noyes`, and each file is idempotent on re-injection. There is no build step and no `"type": "module"`. Tests inject the same files in manifest order (`tests/helpers.mjs`), so the manifest is the single source of load order.

| File | Owns | Role |
| --- | --- | --- |
| `x.js` | nothing | The X adapter: every selector, label, URL shape, layout constant, and timing about X, in one frozen `contract` plus lookups. |
| `ui.js` | the notice | Notices and the `--noyes-header-height` CSS variable. |
| `feed.js` | dismissal suppression | Posts → navigation items; viewport tests; mutation reconciliation. |
| `selection.js` | selection, align/settle | Selected ID, outline painting, alignment, `j`/`k` movement. |
| `feedback.js` | pending like/dismissal, native dismissal records, restore wait | Like, the dismissal state machine, Undo, and the single `interrupt` entry point. |
| `input.js` | consumed keys | Raw events → commands and interrupts. |
| `main.js` | refresh scheduling | Start-up, MutationObserver, repainting, drift detection. |

Dependencies go one way: a file may use only files above it in this order (`x.js` and `ui.js` use none). Cancellation flows down: `input.js` interrupts `selection.js` and `feedback.js`; `feedback.js` never reads keyboard state. `npm run check` runs `scripts/layers.mjs`, which rejects X selectors or labels outside `x.js` and any `noyes.*` reference against the order.

Capture-phase input listeners register at `document_start`; DOM observation starts when the document is ready. Controls require `/home` and the visible English `For you` tab selected inside `primaryColumn`.

## Selection and alignment

Posts are top-level `article[data-testid="tweet"]` elements, identified by the numeric status ID in their timestamp link. Nested articles, recognized ads, and posts without IDs are excluded. A navigation item groups articles sharing a `cellInnerDiv`, or consecutive cells joined by a visible avatar connector. Ads, missing IDs, and non-adjacent cells break groups. Names and mentions are not grouping evidence. The last reply is the action target; the first article is the scroll target.

Ad detection uses a `placementTracking` wrapper around the article or a `promotedIndicator` belonging to that article. A descendant `placementTracking` element alone is not ad evidence: X also uses it for media in ordinary posts. An indicator inside a nested quoted article does not classify its enclosing post as an ad.

Selection stores the target status ID. Feed scans build navigation items used for viewport checks, painting, and alignment. A replacement article with the same ID regains the marker; a node recycled for another ID does not. Class rewrites also restore the marker. DOM order controls navigation without wrapping; the first navigation selects a visible item. After manual scrolling leaves the selection offscreen, actions start from the visible feed.

When no eligible post is visible or the selected item has no loaded neighbor, navigation scrolls once by the usable viewport height. Selection identity remains intact so repeated keys can move through a tall final post without realigning its header. There is no pending navigation intent or automatic scroll when posts arrive. Likes and feedback still require a visible item.

Navigation aligns the item's top below the feed header. For 1.5 seconds, `html.noyes-aligning` disables browser scroll anchoring and snaps to a one-pixel pseudo-element at the selected header. Selected articles temporarily use `overflow: clip` so X's inner overflow container does not trap that snap target. Mutation, scroll, and animation-frame callbacks check alignment, with at most three scripted corrections. The same bounded watch waits for a temporarily unmounted next post to return by ID.

Wheel, touch, pointer, or new key input ends alignment; held repeats of a consumed shortcut do not. Releasing the anchor flushes layout and cancels queued snap animation. The non-passive wheel listener applies the first page-scroll delta once and prevents its default action, avoiding a replayed snap; subsequent wheel events are native. Nested scrolling and Ctrl-wheel zoom keep their defaults. Marker restoration alone never scrolls.

A MutationObserver reconciles dismissals, checks active alignment immediately, and batches marker refreshes through animation frames. A one-second refresh catches URL changes that reuse the DOM. No autonomous feed browsing occurs.

## Native actions and ownership

Likes click only `data-testid="like"`, never unlike. An in-memory set prevents duplicate requests while native state updates. Selection advances immediately, including past already-liked posts, and stays put at the last loaded item.

Not interested has one pending operation, an explicit state machine in `feedback.js` (opening → locating → dispatched, or unavailable, or cancelled) holding the captured menu and discovery deadline:

1. Capture the post ID and existing menus; click the post's caret.
2. Wait for a newly visible menu, excluding menus already open.
3. Match only normalized `not interested in this post` or `not interested in this tweet`.
4. Recheck identity, page, connection, and cancellation before clicking.
5. Leave removal, confirmation, follow-ups, and Undo to X.

Menu discovery polls every 40 ms for up to 1,600 ms, without automatic retry. Unavailable feedback leaves the post unchanged, advances to the captured next item when present, and shows a notice. Success means the native control was clicked, not that X's server accepted feedback.

Cancellation stops dispatch and advancement; every source goes through `feedback.interrupt`, whose source table in `feedback.js` decides whether noyes keeps ownership of a late menu. noyes closes its own menu through X's Escape handler. If cancellation precedes menu appearance, ownership lasts until the original discovery deadline so a late menu can be closed. Intervening input that could open another menu revokes this inference. Direct interaction inside the menu cancels automation and leaves it open for the user. Already-open user menus are never touched.

After dismissal, selection prefers the captured next neighbor, then the previous neighbor, otherwise clears. Pending dismissal records suppress the old article until its identity content is removed. Mutation records detect removal and restoration within one batch, allowing native Undo to restore navigation. Unrelated text changes and equivalent timestamp replacements do not release suppression. There is no permanent blacklist or timed redispatch.

Feedback retains each successful dismissal's ID, original article, and containing feed cell while that native scope remains connected, plus a pointer to the latest dismissal for `u`. No post content is copied. `j` asks feedback to restore the nearest dismissed predecessor in DOM order before ordinary backward navigation. The candidate must lie after the previous ordinary item and before the currently selected visible item; initial or offscreen selection keeps normal visible-feed initialization. `u` still targets only the latest successful dismissal, once, without walking older records.

A shared private restore path requires an exact, visible, enabled native Undo within the captured scope, excluding unrelated controls and recycled posts. Disconnected, recycled, and already-restored entries are removed. A new dismissal in the same native scope replaces the previous scope entry so an old identity cannot claim another post's ownerless Undo. The existing page MutationObserver reconciles retained records as well as feed suppression, invalidating a disconnected original when its scope shows another live identity before a manual native action can replace it with an Undo placeholder. A missing or ambiguous predecessor Undo shows a notice and falls through to normal previous-item navigation; it never restores a farther dismissed item instead.

Dispatch consumes the record before clicking and selects the restored ID using the bounded remount watch. Repeated `j` during a delayed native remount resumes the same key with its original deadline through `selection.select({until})`; manual input, other commands, or expiration end that wait. The default selection alignment bound remains unchanged. During pending feedback, `u` cancels that action instead. noyes never restores X's DOM itself or sends a reverse network request.

Typing, composition, modifiers, held-key repeats, and ordinary menus/dialogs block shortcuts. During pending feedback, navigation can cancel the wait; additional like/dismiss keys are consumed without dispatch. Consumed keys' keypress/keyup events are also intercepted to avoid X shortcut conflicts.

## When X changes

If posts stop being recognizable (articles in the column, but no post matches or none has an ID, on two checks a second apart), noyes shows one notice per page load and its shortcuts find nothing to act on. `l` on a post with neither a like nor an unlike control shows `Like control not found.` once. Other breakages fail closed with the existing notices; see the degradation matrix in [resilience-plan.md](resilience-plan.md#34-degradation-matrix).

To fix drift:

1. Run the live probe (`npm run probe:live`, see [README.md](../README.md#development)); it names the failing inventory rows.
2. Edit the matching `contract` entry (or, rarely, its lookup) in `extension/x.js`. Add a second `candidates` entry only when the probe shows X serving both forms; never guess a fallback.
3. Run the required checks in [AGENTS.md](../AGENTS.md#verification-and-completion), then the probe again.
4. Bump the `manifest.json` version and run `npm run package`.

## Data, packaging, and checks

Runtime inputs are the displayed DOM and keystrokes. State exists only in memory for the page lifetime. There is no storage, analytics, credential handling, backend, or direct network client; X owns requests from native controls.

Packaging reads the manifest version and writes `dist/noyes-<version>.zip`, replacing that version's ZIP. All top-level files in `extension/` are included, so tools and fixtures must stay elsewhere.

Unit tests (`npm run test:unit`) load modules into a `node:vm` context the way Chrome does, with fakes for the modules a test leaves out; they cover feed grouping and reconciliation, the dismissal state machine and interrupt table, and input gating. Layout, scrolling, and snapping stay in browser tests.

`tests/feed.js` defines synthetic records with required IDs, also used in status URLs and action logs. `tests/fixture.mjs` embeds it in the HTML fixture for routed browser tests. The vet adapter selects Git-tracked/unignored JavaScript, runs Node syntax checks, then invokes the upstream analyzer and workflow checker. `vet.yaml` controls rules. See [AGENTS.md](../AGENTS.md#verification-and-completion) for required checks and [README.md](../README.md#development) for setup.

## Verification limits

Browser tests and the extension-loading smoke test serve a simulated X page. They cover targeting, cancellation, remounts, Undo, and modeled feed shifts, but do not establish current live X compatibility or recommendation effects.

Live checks verified installation, the outline, sampled navigation, a context/reply avatar connector, and Escape closing X's menu. Sampled ordinary navigation and a forced viewport jump held the selected header below the feed tabs. These checks do not prove every asynchronous X update is handled. Live like/feedback dispatch and automatic advancement remain unverified. Other locales and native mobile support are outside the implemented scope.
