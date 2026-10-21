# How wheel works

wheel is a Manifest V3 content script and CSS that turns keyboard input into native X actions. [README.md](../README.md#keyboard-shortcuts) defines supported behavior and shortcuts.

## Layout and loading

- `extension/`: shipped manifest, DOM interaction code, and styles.
- `tests/`: synthetic feed, browser tests, and extension-loading smoke test.
- `scripts/`: packaging, vet adapter, and adapter tests.
- `vendor/`: pinned development-only vet dependency and provenance.
- `.github/workflows/`: CI checks and artifacts.

The manifest injects on HTTPS `x.com` and `twitter.com`. Capture-phase keyboard listeners register at `document_start`; DOM observation starts when the document is ready. A per-page guard prevents duplicate initialization. Controls require `/home` and the visible English `For you` tab selected inside `primaryColumn`.

## Selection and alignment

Posts are top-level `article[data-testid="tweet"]` elements, identified by the numeric status ID in their timestamp link. Nested articles, recognized ads, and posts without IDs are excluded. A navigation item groups articles sharing a `cellInnerDiv`, or consecutive cells joined by a visible avatar connector. Ads, missing IDs, and non-adjacent cells break groups. Names and mentions are not grouping evidence. The last reply is the action target; the first article is the scroll target.

Selection stores the target status ID. Feed scans build navigation items used for viewport checks, painting, and alignment. A replacement article with the same ID regains the marker; a node recycled for another ID does not. Class rewrites also restore the marker. DOM order controls navigation without wrapping; the first navigation selects a visible item. After manual scrolling leaves the selection offscreen, actions start from the visible feed.

When no eligible post is visible or the selected item has no loaded neighbor, navigation scrolls once by the usable viewport height. Selection identity remains intact so repeated keys can move through a tall final post without realigning its header. There is no pending navigation intent or automatic scroll when posts arrive. Likes and feedback still require a visible item.

Navigation aligns the item's top below the feed header. For 1.5 seconds, `html.wheel-aligning` disables browser scroll anchoring and snaps to a one-pixel pseudo-element at the selected header. Selected articles temporarily use `overflow: clip` so X's inner overflow container does not trap that snap target. Mutation, scroll, and animation-frame callbacks check alignment, with at most three scripted corrections. The same bounded watch waits for a temporarily unmounted next post to return by ID.

Wheel, touch, pointer, or new key input ends alignment; held repeats of a consumed shortcut do not. Releasing the anchor flushes layout and cancels queued snap animation. The non-passive wheel listener applies the first page-scroll delta once and prevents its default action, avoiding a replayed snap; subsequent wheel events are native. Nested scrolling and Ctrl-wheel zoom keep their defaults. Marker restoration alone never scrolls.

A MutationObserver reconciles dismissals, checks active alignment immediately, and batches marker refreshes through animation frames. A one-second refresh catches URL changes that reuse the DOM. No autonomous feed browsing occurs.

## Native actions and ownership

Likes click only `data-testid="like"`, never unlike. An in-memory set prevents duplicate requests while native state updates. Selection advances immediately, including past already-liked posts, and stays put at the last loaded item.

Not interested has one pending operation containing an AbortController, captured menu, and discovery deadline:

1. Capture the post ID and existing menus; click the post's caret.
2. Wait for a newly visible menu, excluding menus already open.
3. Match only normalized `not interested in this post` or `not interested in this tweet`.
4. Recheck identity, page, connection, and cancellation before clicking.
5. Leave removal, confirmation, follow-ups, and Undo to X.

Menu discovery polls every 40 ms for up to 1,600 ms, without automatic retry. Unavailable feedback leaves the post unchanged, advances to the captured next item when present, and shows a notice. Success means the native control was clicked, not that X's server accepted feedback.

Cancellation stops dispatch and advancement. wheel closes its own menu through X's Escape handler. If cancellation precedes menu appearance, ownership lasts until the original discovery deadline so a late menu can be closed. Intervening input that could open another menu revokes this inference. Direct interaction inside the menu cancels automation and leaves it open for the user. Already-open user menus are never touched.

After dismissal, selection prefers the captured next neighbor, then the previous neighbor, otherwise clears. Pending dismissal records suppress the old article until its identity content is removed. Mutation records detect removal and restoration within one batch, allowing native Undo to restore navigation. Unrelated text changes and equivalent timestamp replacements do not release suppression. There is no permanent blacklist or timed redispatch.

`u` retains only the latest successfully dispatched dismissal's ID, original article, and containing feed cell. It requires an exact, visible, enabled native Undo control within that scope, excluding unrelated controls and recycled posts. Dispatch consumes the record and selects the restored ID using the bounded remount watch. Missing Undo shows a notice; `u` during pending feedback cancels that operation instead. wheel never restores X's DOM itself or sends a reverse network request.

Typing, composition, modifiers, held-key repeats, and ordinary menus/dialogs block shortcuts. During pending feedback, navigation can cancel the wait; additional like/dismiss keys are consumed without dispatch. Consumed keys' keypress/keyup events are also intercepted to avoid X shortcut conflicts.

## Data, packaging, and checks

Runtime inputs are the displayed DOM and keystrokes. State exists only in memory for the page lifetime. There is no storage, analytics, credential handling, backend, or direct network client; X owns requests from native controls.

Packaging reads the manifest version and writes `dist/wheel-<version>.zip`, replacing that version's ZIP. All top-level files in `extension/` are included, so tools and fixtures must stay elsewhere.

`tests/feed.js` defines synthetic records with required IDs, also used in status URLs and action logs. `tests/fixture.mjs` embeds it in the HTML fixture for routed browser tests. The vet adapter selects Git-tracked/unignored JavaScript, runs Node syntax checks, then invokes the upstream analyzer and workflow checker. `vet.yaml` controls rules. See [AGENTS.md](../AGENTS.md#verification-and-completion) for required checks and [README.md](../README.md#development) for setup.

## Verification limits

Browser tests and the extension-loading smoke test serve a simulated X page. They cover targeting, cancellation, remounts, Undo, and modeled feed shifts, but do not establish current live X compatibility or recommendation effects.

Live checks verified installation, the outline, sampled navigation, a context/reply avatar connector, and Escape closing X's menu. Sampled ordinary navigation and a forced viewport jump held the selected header below the feed tabs. These checks do not prove every asynchronous X update is handled. Live like/feedback dispatch and automatic advancement remain unverified. Other locales and native mobile support are outside the implemented scope.
