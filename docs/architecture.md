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

A navigation item groups top-level articles in the same `cellInnerDiv`, or consecutive cells joined by a visible thin line below the first post’s avatar reaching the next article. Unknown layouts remain separate; author names and mentions are never grouping evidence. Ads, missing IDs, and non-adjacent cells break a group. The last displayed reply is the like/feedback target. This is a DOM-based approximation, not access to X’s recommendation reason.

Selection stores the target reply’s status ID. Each processing pass reads navigation items containing the ID, target reply, first article, and member articles; viewport checks, painting, and alignment share those items instead of rebuilding groups. X can recycle DOM nodes, so the ID must still match before feedback is dispatched. Nested article posts and recognized promoted-post markers are excluded.

Navigation uses DOM order without wrapping. The first navigation selects the first post intersecting the usable viewport. Navigation aligns the top of the chosen post below the feed header. For 1.5 seconds after navigation, `html.wheel-aligning` disables browser scroll anchoring and enables vertical scroll snapping to a one-pixel pseudo-element at the selected header. A full-article snap area would still allow scrolling inside tall posts. Selected articles temporarily use `overflow: clip` instead of X’s `hidden`, preserving clipping without trapping the snap target in an inner scroll container. DOM/style mutations, scroll events, and animation frames also check alignment with at most three scripted corrections. There is no 120 ms debounce: that delay left the incorrect position visible for roughly eight frames in the user's recording. Wheel, touch, pointer, or new key input ends the watch at once; ignored repeats of a consumed shortcut do not cancel it. If feedback temporarily unmounts the next post before advancement, the same bounded watch waits for its status ID to return and performs the initial alignment then. Manual input still cancels this pending scroll. Releasing the anchor flushes layout and cancels any queued snap animation at the current scroll position before the wheel default action. The wheel listener is non-passive. For the first page-scroll event that ends alignment, it applies the wheel delta once with an instant scroll and prevents that event’s default action to avoid Chrome replaying a queued snap animation. Subsequent wheel events are native. Nested scroll controls and Ctrl-wheel zoom retain their default actions. Restoring the selection marker after DOM changes does not scroll; outside that watch, X and the browser retain control of layout adjustments. If manual scrolling leaves the old selection offscreen, the next action starts with a visible post. `.wheel-selected` supplies a green outline inset around a single post. For conversations, additional classes draw connected inset edges across the constituent articles without reparenting X’s DOM. Navigation scrolls to the first context article.

Selection retains the tweet ID when React temporarily replaces an article. A replacement with the same ID regains the green marker; an element recycled for a different ID never inherits it. Class rewrites also restore the marker.

A MutationObserver checks active alignment immediately and batches selection-marker refreshes through animation frames. A one-second refresh also catches URL changes that reuse the DOM. There is no autonomous scrolling or background feed curation.

## Dispatching feedback

A like targets only the native `data-testid="like"` control. It never invokes the unlike control. A short in-memory set prevents duplicate like requests while the native state updates. Selection advances immediately to the next loaded post, even if the current post is already liked; it stays put at the end.

Not interested is serialized through one pending operation containing an AbortController, its captured menu, and its discovery deadline:

1. Record the post ID and existing menus, then click that post's native caret.
2. Wait for a newly created visible menu; do not reuse an already-open menu.
3. Match only the normalized labels `not interested in this post` or `not interested in this tweet`.
4. Recheck the post ID, page, connection, and cancellation state before clicking.
5. Leave X in charge of removal, confirmation, follow-up prompts, and Undo.

Each menu lookup has a 1,600 ms deadline and polls every 40 ms. There is no automatic action retry. Cancellation stops dispatch without advancing. Wheel and touch input cancel pending feedback as well as alignment, so a later completion cannot override manual scrolling. Missing feedback leaves the post unchanged, advances selection, and shows “Skipped — feedback unavailable.” A menu opened by wheel is closed through X’s Escape handler on cancellation or unavailable feedback. If navigation cancels before the menu appears, the operation keeps ownership until the original discovery deadline so it can close that late menu. Intervening input that could open a different menu revokes this inference; wheel preserves that menu rather than guessing. Direct interaction inside a native menu hands control back to the user and cancels automatic feedback without closing that menu. An already-open user menu is never touched. No alternate menu action is used.

Unavailable feedback moves forward to the captured next item, staying put at the end of the loaded feed. After a successful keyboard dismissal, selection prefers the captured next neighbor, then the previous neighbor when no next neighbor remains; it clears if neither is usable. Pending dismissal records suppress a still-mounted post until its native content transitions. DOM mutation records release that suppression when the post’s identity content is removed, including removal and restoration within one observer batch. Unrelated text updates and equivalent timestamp replacements do not release it. A restored post is navigable even when Undo reuses the original article; there is no permanent dismissal blacklist or timeout-based redispatch. Success here means the native control was clicked, not that X's server accepted feedback or changed future recommendations.

The shortcut handler ignores typing targets, composition events, modifier keys, repeated keydown events, and ordinary menus/dialogs. During wheel's own pending feedback, navigation can cancel the wait; additional like/dismiss keys are consumed without another action. Consumed keys' keypress/keyup events are also intercepted to avoid native X shortcut conflicts.

The `u` shortcut uses one record of the latest successfully dispatched dismissal: its status ID, original article, and containing feed cell (or article when no cell exists). Undo must be an exact, visible, enabled native control within that scope; unrelated controls and recycled posts are not candidates. No local DOM restoration or reverse network request substitutes for X’s native action. After dispatch, wheel consumes the record and selects the restored status ID using the existing bounded remount alignment. Missing Undo shows a notice. During a pending dismissal, `u` cancels it without undoing an earlier dismissal. Typing, modifiers, overlays, and held-key repeats retain the normal shortcut protections.

## Data and artifacts

The runtime's input is the displayed DOM plus the user's keystroke. Post IDs connect selection and pending feedback; DOM position alone is not an identity. The live DOM wins over cached state when a post changes.

Runtime output is a selection marker, transient notice, or native UI action. State is in memory for the page lifetime. The extension has no storage, analytics, credentials, backend, or direct network client. X owns any requests resulting from its native controls.

The package script reads the release version from `extension/manifest.json` and writes `dist/wheel-<version>.zip`. A rerun replaces that version's ZIP; ZIPs for other versions remain. It includes all top-level files in `extension/`, not an explicit file allowlist. Keeping unrelated files out of that directory is a contributor convention, not a packaging safeguard.

`tests/feed.js` defines synthetic post records with a required `id`; text, name, and handle have defaults. The fixture uses the ID in its status URL and action log. `tests/fixture.mjs` embeds that script in `tests/feed.html` for routed browser tests; the direct HTML fixture can load it as a separate script.

## Quality checks and evidence limits

The agent verification entry point is [AGENTS.md](../AGENTS.md#verification-and-completion). The README owns setup and command usage; package scripts and the workflow define what actually runs.

The vet adapter supplies JavaScript text directly to the upstream analyzer because upstream discovery skips JavaScript files. Git's tracked and unignored file list supplies default inputs. Node syntax checking runs before analysis so invalid JavaScript cannot silently pass formatting. `vet.yaml` controls enabled rules. No TypeScript migration or runtime dependency is implied.

Browser tests run against a simulated X page. The extension smoke test loads the manifest and content script in an isolated Chromium profile, but still serves the simulated page. Passing either does not prove the current signed-in X DOM, recommendation effects, or every localization works.

Installation, selection, the green outline, and removal of injected buttons were verified live. The avatar connector was checked on the reported live context/reply conversation, and Escape key release was verified to close X’s menu. Group navigation and feedback are covered by synthetic tests; live like/feedback dispatch and automatic advancement remain unverified. Realignment after a post-navigation feed shift is covered by synthetic tests that model X's transform-positioned cells; the live shift itself has not been reproduced under instrumentation. On 2026-10-03, 15 navigations in a separate signed-in X tab kept the selected header at 100 px. Inspection of the affected work Chrome tab showed an older content script without the settling code. Reloading the extension and then X loaded the updated source (verified in DevTools); subsequent K navigation showed the selected header below the feed tabs. This verifies deployment and the sampled navigation, not elimination of every intermittent shift. Follow-up synthetic regressions reproduced and fixed missing alignment after a like temporarily unmounted the next post, and cancellation of alignment by a held shortcut. A delayed dismissal collapse with native focus restoration is also covered; these feedback scenarios have not been reproduced on the live account. Expansion beyond the English desktop web experience—including native mobile support, other locales, settings, backend services, and AI filtering—is **undecided**. None of these features exists today; this document does not request their implementation.

The jitter regression samples twelve rendering opportunities after a forced viewport jump and after delayed feed compensation, including X’s overflow-hidden article layout. In a separate live X diagnostic tab, a forced 450 px viewport jump held the selected header at 100 px in all twelve samples after the clipping adjustment. Twelve ordinary live navigations also remained at 100 px throughout their sampled transitions. This verifies those cases, not every asynchronous X update.
