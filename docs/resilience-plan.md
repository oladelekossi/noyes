# Plan: a layered wheel that survives X changes

Status: **plan**. Nothing below is built unless a line says `built`. Written against the working tree on 2026-10-31: `extension/content.js` at 774 lines with uncommitted edits on top of commit `10515f1` (see Phase 0).

Read this before: splitting `content.js`, changing how wheel finds anything on X's page, adding tests, or deciding what to do after an X layout change. For current behavior read [architecture.md](architecture.md). For required checks read [AGENTS.md](../AGENTS.md).

## 1. Outcome and constraints

Outcome: when X changes markup, wording, or layout, wheel (a) fails closed — never acts on the wrong post or control, and tells the user which feature stopped working — and (b) is fixed by a data edit in one file, verified by one command, without touching navigation, feedback, or undo logic.

Fixed constraints. A phase that violates one is wrong, however elegant.

- **No build step.** `extension/` is loaded unpacked as-is. No bundler, transpiler, TypeScript, or framework. Reason: README promises it, and the extension-loading smoke test depends on it.
- **No runtime dependencies, storage, analytics, or network.** README "Privacy" is a user promise.
- **Only native X controls are clicked**, matched by exact `data-testid` or exact normalized label. Never the first menu item, never a guess from an icon or position. When a lookup fails, wheel does nothing and says so.
- **User-visible behavior is unchanged** — the five shortcuts and every sentence of README. The one addition is a notice when wheel detects it cannot read the page (§3.5). A phase that changes anything else is a bug in the phase.
- **vet rules stay**: one parameter per function (named options objects), Prettier, pinned Actions.

`not planned`: other locales, Following tab, mobile, settings, automatic feedback retry. The adapter in §3.3 makes a locale a data change; adding one is a separate decision.

## 2. What exists today (`built`)

- One IIFE in `extension/content.js` with nine module-level mutable variables (`dismissedPosts`, `handledKeys`, `pendingLikes`, `scheduled`, `noticeTimer`, `selection`, `settling`, `pendingFeedback`, `lastDismissal`) shared by every function. Comment banners mark six sections: DOM helpers, feed model, selection/alignment, native actions, shortcuts, page observation.
- Three concurrent processes cancel each other from six call sites: `handleShortcut`, `releaseForWheel`, the touch/pointer listeners, the second `keydown` listener, the `cancel` closure inside `dismiss()`, and the `finally` block of `dismiss()` (which also polls). `dismiss()` is ~110 lines of async `try/catch/finally`.
- About 65 Playwright tests in three spec files; `tests/wheel.spec.mjs` is 1386 lines. No unit tests of extension logic. `node --test` is used only for `scripts/vet.test.mjs`.
- `tests/wheel.spec.mjs` `start()` and `tests/extension.spec.mjs` assert `.wheel-button` has count 0. No code creates that class; the assertion cannot fail. Remove in Phase 5.
- `vet` selects every tracked/unignored `.js`/`.mjs`, so new files under `extension/` are checked automatically. `scripts/package.mjs` zips every top-level file in `extension/`, so new runtime files ship automatically and nothing else may live there.

### 2.1 Inventory of X assumptions in `content.js`

Every row is a place X can break wheel. Today they are spread across the file; the plan moves all of them into `extension/x.js`.

| #   | Assumption                                                                                                                                                                                                      | Form today                                                            | Used by                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| 1   | A post is `article[data-testid="tweet"]`; a nested article is a quoted post                                                                                                                                     | `POST`, `own()`, `readFeed()`                                         | everything                         |
| 2   | A feed cell is `[data-testid="cellInnerDiv"]`                                                                                                                                                                   | `CELL`                                                                | grouping, undo scope               |
| 3   | The main column is `[data-testid="primaryColumn"]`                                                                                                                                                              | `primaryColumn()`                                                     | feed scan, For You check           |
| 4   | For You = `location.pathname` is `/home` and a visible `[role="tab"][aria-selected="true"]` in the column has text `for you`                                                                                    | `onForYou()`                                                          | shortcut gate, cancellation        |
| 5   | A post's ID is `(\d+)` after `/status/` in the `href` of the anchor around the post's own `time`                                                                                                                | `hrefId`, `postKey`                                                   | identity everywhere                |
| 6   | Ads: post inside or containing `[data-testid="placementTracking"]`, or containing `[data-testid="promotedIndicator"]`                                                                                           | `isAd()`                                                              | feed scan                          |
| 7   | Avatar is `[data-testid="Tweet-User-Avatar"]`                                                                                                                                                                   | `continuesConversation()`                                             | grouping                           |
| 8   | Conversation connector: an empty `div` 1–3 px wide, >8 px tall, centered on the avatar within 4 px, bottom within 4 px of the post, painted background, not `opacity: 0`; adjacent cells within 4 px vertically | `isAvatarRail()`, `continuesConversation()`                           | grouping                           |
| 9   | Like control is `[data-testid="like"]`; already liked shows `unlike`                                                                                                                                            | `likePost()`                                                          | `l`                                |
| 10  | Post menu trigger is `[data-testid="caret"]`                                                                                                                                                                    | `dismiss()`                                                           | `n`                                |
| 11  | Menus are `[role="menu"]` containing `[role="menuitem"]`; a new one appears after the caret click                                                                                                               | `MENU`, `discoverMenu`, `feedbackItem`                                | `n`, overlay gate                  |
| 12  | Feedback item label normalizes to `not interested in this post` or `not interested in this tweet`                                                                                                               | `FEEDBACK_LABELS`                                                     | `n`                                |
| 13  | Dispatching Escape `keydown`+`keyup` on a menu closes it                                                                                                                                                        | `closeMenu()`                                                         | cancellation                       |
| 14  | Undo is a `button`/`[role="button"]` whose text normalizes to `undo`, inside the dismissed post's cell                                                                                                          | `undoControls()`                                                      | `u`                                |
| 15  | Overlays are `[role="menu"], [role="dialog"], [aria-modal="true"]`                                                                                                                                              | `overlayOpen()`                                                       | shortcut gate                      |
| 16  | The sticky header is 100 px tall; 32 px bottom margin                                                                                                                                                           | `VIEWPORT_TOP`, `VIEWPORT_BOTTOM`, and `100px` twice in `content.css` | viewport test, alignment, CSS snap |
| 17  | X sets `overflow: hidden` on articles, creating an inner scroll container                                                                                                                                       | `content.css` `overflow: clip` override                               | alignment                          |
| 18  | A menu appears within 1600 ms, polled every 40 ms                                                                                                                                                               | `MENU_TIMEOUT`, `POLL_INTERVAL`                                       | `n`                                |
| 19  | Hosts are `x.com` and `twitter.com` over HTTPS                                                                                                                                                                  | `manifest.json`                                                       | injection                          |

Rows 1–15 are DOM contract. 16–17 are layout contract shared with CSS. 18 is timing. 19 stays in the manifest.

## 3. Target architecture

### 3.1 Files and load order

```
extension/
  manifest.json      "js": ["x.js", "ui.js", "feed.js", "selection.js", "feedback.js", "input.js", "main.js"]
  content.css
  x.js               the only file that knows what X looks like (rows 1–18)
  ui.js              notice element; CSS custom properties
  feed.js            posts → navigation items; viewport; neighbors; dismissal suppression
  selection.js       selection identity; painting; align/settle process
  feedback.js        like; Not-interested state machine; undo
  input.js           key/wheel/touch capture → commands and interrupts
  main.js            load guard; MutationObserver; scheduling; wiring
```

Mechanism, no tooling: Chrome injects the files listed in a `content_scripts` entry's `js` array **in array order, as classic scripts, into one isolated world per frame**. `"type": "module"` is not available for content scripts, so files share state through one namespace object:

```js
// top of every file
(() => {
  "use strict";
  const wheel = (globalThis.__wheel ??= {});
  if (wheel.x) return; // each file is idempotent on re-injection
  wheel.x = Object.freeze({ ... });
})();
```

`main.js` keeps today's once-only start guard. Tests inject the same files in the same order by reading `manifest.json` (§4.2), so the manifest is the single source of load order. `content.js` is deleted at the end of Phase 4; until then it remains the shipped file.

### 3.2 Dependency rule

Strictly one direction. A file may call only files above it in this list.

```
x.js  ui.js        ← base: no wheel.* dependencies
feed.js            ← x
selection.js       ← x, feed
feedback.js        ← x, ui, feed, selection
input.js           ← x, feed, selection, feedback
main.js            ← everything
```

Consequences:

- Nothing below `x.js` may contain a `data-testid`, a `role=` selector, a `/status/` pattern, a label string, or a pixel constant about X's layout. The checker below rejects it.
- Cancellation flows **down**: `input.js` calls `feedback.interrupt()` and `selection.interrupt()`. `feedback.js` never reaches up to read keyboard state; it receives an event.
- `feedback.js` advances selection after a dismissal by calling `selection.select()`. That is allowed (down). `selection.js` never calls feedback.

Enforcement — `planned`, Phase 2: `scripts/layers.mjs`, run by `npm run check` after vet.

- Rule A: for each file in `extension/*.js` other than `x.js`, the source must not match `/data-testid|\[role=|\/status\/|not interested|placementTracking|promotedIndicator/i`. A violation prints the file, line, and the matching text, exit 1.
- Rule B: for each file, collect `wheel.<name>` references; each referenced name must be listed as allowed for that file in a table at the top of `layers.mjs` that mirrors the list above. Violation prints file, line, name, exit 1.
- Exit 0 prints `layers: N files checked; no violations.`
- Exit 2 for setup errors (missing manifest, file listed in manifest absent on disk, file on disk missing from manifest).

### 3.3 Module specifications

Each module: **Owns** (the only mutable state it holds), **Provides** (public interface, all one-parameter options objects per vet), **Must not**.

#### x.js — the X adapter

Owns: no runtime state. A frozen `contract` table and pure lookup functions.

Provides:

```js
wheel.x = {
  contract,                          // see below
  onForYou(),                        // row 4
  column(),                          // row 3 → Element | null
  posts({ root }),                   // row 1: top-level articles in DOM order, nested excluded
  postId({ post }),                  // row 5 → string | undefined
  isAd({ post }),                    // row 6
  cell({ post }),                    // row 2 → Element | null
  avatar({ post }),                  // row 7
  isConversationRail({ post, next }),// row 8: the pixel heuristic, whole and only here
  likeControl({ post }),             // row 9 → Element | null; null when liked or missing
  likeState({ post }),               // "like" | "liked" | "missing"  (drift detection, §3.5)
  caret({ post }),                   // row 10
  menus({ root }),                   // row 11
  feedbackItem({ menu }),            // rows 11–12
  closeMenu({ menu }),               // row 13
  undoControls({ post, scope }),     // row 14
  overlayOpen(),                     // row 15
  typingContext({ event }),          // input/textarea/contenteditable test (generic, lives here so input.js has no selectors)
  layout: { headerHeight: 100, bottomMargin: 32 },   // row 16
  timing: { menuTimeout: 1600, pollInterval: 40 },   // row 18
  health({ root }),                  // §3.5
};
```

`contract` is the data the probe (§5) and `health()` read:

```js
const contract = Object.freeze({
  post: { candidates: ['article[data-testid="tweet"]'] },
  cell: { candidates: ['[data-testid="cellInnerDiv"]'] },
  column: { candidates: ['[data-testid="primaryColumn"]'] },
  statusHref: { pattern: /\/status\/(\d+)/ },
  ad: {
    candidates: [
      '[data-testid="placementTracking"]',
      '[data-testid="promotedIndicator"]',
    ],
  },
  avatar: { candidates: ['[data-testid="Tweet-User-Avatar"]'] },
  like: {
    candidates: ['[data-testid="like"]'],
    liked: ['[data-testid="unlike"]'],
  },
  caret: { candidates: ['[data-testid="caret"]'] },
  menu: { candidates: ['[role="menu"]'], item: '[role="menuitem"]' },
  feedbackLabels: [
    "not interested in this post",
    "not interested in this tweet",
  ],
  undoLabel: "undo",
  forYouLabel: "for you",
  overlay: {
    candidates: ['[role="menu"]', '[role="dialog"]', '[aria-modal="true"]'],
  },
});
```

`candidates` is an ordered list; a lookup uses the first candidate that matches. **Today every list has exactly one entry — the selector in use now.** Do not add speculative fallbacks: an unverified fallback can match the wrong element, and the cardinal rule is never to misfire. A second candidate is added only when the live probe (§5) shows X shipping a new form alongside the old one.

Must not: hold state across calls; scroll; click anything except through `closeMenu`; know about selection, keys, or notices.

The pixel heuristic in row 8 is the most fragile item in the inventory and the only one that is not a selector. It stays a function in `x.js` with its thresholds as named constants in `contract.rail` so the probe can report which threshold failed on a live conversation.

Layout and CSS (rows 16–17): `ui.js` writes `document.documentElement.style.setProperty("--wheel-header-height", x.layout.headerHeight + "px")` at start. `content.css` replaces its two literal `100px` with `var(--wheel-header-height, 100px)`. The header height then has one home. The `overflow: clip` override stays in CSS with its existing comment; it is harmless if X stops using `overflow: hidden`.

#### ui.js

Owns: the notice element and its timer. Provides `notify({ message })`, `clearNotice()`, `setLayoutVars({ layout })`. Must not: read the feed.

#### feed.js

Owns: `dismissedPosts` (the suppression map) and nothing else. Provides:

```js
read(); // → items [{ key, head, target, articles }] exactly as readFeed() builds them today
inViewport({ item });
current({ items, selectionKey }); // currentItem() today
neighbors({ items, key }); // → { next, previous } keys
suppress({ post, key }) / release({ post }) / isSuppressed({ post, key });
reconcile({ records }); // reconcileDismissals() today
```

Must not: scroll, paint, or know about keys. All DOM queries go through `wheel.x`.

#### selection.js

Owns: `selection` (`{ key } | null`) and `settling` (the align/settle process state). Provides:

```js
get(); // → key | null
select({ item, key, scroll }); // selectItem() today
clear();
interrupt({ source }); // stopSettling() today, plus the wheel-release scroll flush when source === "wheel"
paint({ item }); // paintSelection() today; called by main on sync
align(); // alignSelection() today; called by main from observer/scroll
```

Must not: read keyboard events; know about feedback.

#### feedback.js

Owns: `pendingLikes`, the one pending operation, `lastDismissal`. Provides:

```js
like({ item, items }); // likeCurrent() today
dismiss({ item, items }); // dismissCurrent() today, driving the machine below
undo(); // undoDismissal() today
interrupt({ source, event }); // the single cancellation entry point
pending(); // boolean, for input.js gating
```

The Not-interested operation becomes an explicit machine. Today's behavior, written out:

States

| State         | Meaning                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`        | no operation                                                                                                                              |
| `opening`     | caret clicked; polling for a menu not in `previousMenus`                                                                                  |
| `locating`    | menu captured; polling for the labelled item                                                                                              |
| `dispatched`  | item clicked; `lastDismissal` recorded; → `idle`                                                                                          |
| `unavailable` | caret missing, or a poll timed out on an unchanged post; notice shown; → `idle`                                                           |
| `cancelled`   | aborted; if `ownsLateMenu` and no menu was captured, keep polling until the original deadline to close a menu that arrives late; → `idle` |

Events and transitions

| From                 | Event                                                                 | To            | Effect                                                   |
| -------------------- | --------------------------------------------------------------------- | ------------- | -------------------------------------------------------- |
| `idle`               | `start` with no caret                                                 | `unavailable` | notice `Skipped — feedback unavailable.`                 |
| `idle`               | `start` while another operation pending, not For You, or overlay open | `idle`        | nothing                                                  |
| `opening`            | menu found                                                            | `locating`    | record menu                                              |
| `opening`/`locating` | post ID changed, post disconnected, or left For You                   | `cancelled`   | `ownsLateMenu` unchanged                                 |
| `opening`/`locating` | timeout, post unchanged                                               | `unavailable` | close captured menu; notice                              |
| `locating`           | item found; post still current; not aborted                           | `dispatched`  | suppress post; capture cell as undo scope; click item    |
| any pending          | `interrupt`                                                           | `cancelled`   | apply table below; close captured menu via `x.closeMenu` |
| `cancelled`          | late menu appears before deadline and `ownsLateMenu`                  | `cancelled`   | close it                                                 |
| `cancelled`          | deadline                                                              | `idle`        | release suppression if not dispatched                    |

Interrupt sources — this table is the whole of today's `allowLate` logic, which is currently spread over five call sites:

| `source`                                         | `ownsLateMenu` after                 | Why                                             |
| ------------------------------------------------ | ------------------------------------ | ----------------------------------------------- |
| `shortcut` (j/k/u consumed by wheel)             | unchanged (true)                     | consumed keys cannot open a user menu           |
| `escape` (unmodified Escape)                     | unchanged                            | Escape closes, never opens                      |
| `key` (any other key)                            | false                                | could open a user menu                          |
| `wheel`                                          | unchanged                            | scrolling opens nothing                         |
| `touch`                                          | unchanged                            | matches today's touchstart / touch pointer rule |
| `pointer` (mouse/pen down)                       | false                                | a click could open a menu                       |
| `menuInput` (event target inside a visible menu) | false, and captured menu is released | the user took the menu; never close it          |

Invariants (each becomes a unit test in Phase 3): at most one operation exists; a dismissal is recorded only after a click; suppression is released on every non-dispatched exit; `l`/`n` during a pending operation are consumed with no effect; `u` during a pending operation interrupts with `source: "shortcut"` and does not undo.

Must not: read `event.key` to decide anything beyond the `source` passed in; touch the keyboard listeners.

#### input.js

Owns: `handledKeys`. Provides `install()` which registers today's capture-phase listeners (`keydown` ×2, `keypress`, `keyup`, `wheel`, `touchstart`, `pointerdown`, `blur`). Translates raw events into exactly two kinds of call:

- `interrupt({ source })` on both `selection` and `feedback`, with `source` from the table above;
- commands: `navigate({ direction })`, `like()`, `dismiss()`, `undo()` — the body of `handleShortcut()` today.

The gating order in `handleShortcut()` (shortcut key → unmodified → not composing → not typing → on For You → overlay rule → preventDefault → repeat check) is preserved verbatim. The non-passive wheel listener's first-delta scroll stays here; it calls `selection.interrupt({ source: "wheel" })` and the flush happens inside selection.

Must not: contain a selector or label (uses `x.typingContext`, `x.onForYou`, `x.overlayOpen`).

#### main.js

Owns: `scheduled`. Provides nothing. Does: load guard; `ui.setLayoutVars`; `input.install`; the MutationObserver (`feed.reconcile` → `selection.align` → schedule `sync`); `popstate`/`hashchange`/`scroll` listeners; the 1 s interval; `sync()` which clears selection off For You and repaints otherwise; the drift check in §3.5.

### 3.4 Degradation matrix

What still works when one row of the inventory breaks. "Closed" means wheel does nothing and shows a notice; it never acts on a different element.

| Broken row       | Navigation `j`/`k`                                                                  | `l`                                                                     | `n`                  | `u`    | User sees                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 1 post selector  | off                                                                                 | off                                                                     | off                  | off    | drift notice (§3.5)                                                                                                               |
| 3 column / 4 tab | off (gate fails)                                                                    | off                                                                     | off                  | off    | nothing (as today: wheel believes it is not on For You). Probe catches it.                                                        |
| 5 ID             | off (no items)                                                                      | off                                                                     | off                  | off    | drift notice                                                                                                                      |
| 6 ads            | works; ads become navigable and `n` offers whatever menu they have — **not closed** |                                                                         |                      |        | nothing. Mitigation: row 12 exact labels exclude `not interested in this ad`; probe asserts an ad is excluded when one is visible |
| 8 rail           | works; conversations split into separate items                                      | works                                                                   | works                | works  | nothing visible; probe reports rail failures                                                                                      |
| 9 like           | works                                                                               | closed, silent when `likeState` is `liked`; drift notice when `missing` | works                | works  | notice only on drift                                                                                                              |
| 10 caret         | works                                                                               | works                                                                   | closed               | works  | `Skipped — feedback unavailable.` (today's behavior)                                                                              |
| 11–12 menu/label | works                                                                               | works                                                                   | closed after timeout | works  | same notice                                                                                                                       |
| 14 undo          | works                                                                               | works                                                                   | works                | closed | `Undo unavailable.` (today)                                                                                                       |
| 16 header height | works, header may be covered by 1 wrong offset                                      | works                                                                   | works                | works  | visual only; one constant to change                                                                                               |

Row 6 is the one soft spot: ad detection failing opens the ad's menu. The exact-label rule keeps the click closed, but the menu flashes. Accepted; no safe automatic fallback exists.

### 3.5 Drift detection (`planned`, Phase 4)

A page-level check, cheap, run from `main.sync()` at most once per second while on For You:

- Condition: `x.column()` exists and contains ≥ 3 `article` elements (any article — this is the one place a bare `article` is queried, in `x.health()`), and `feed.read()` has returned zero items for two consecutive checks.
- Action: `ui.notify({ message: "wheel can't read this feed layout — shortcuts are off until wheel is updated." })` once per page load; set `wheel.__driftNoticed = true`.
- Per action: `l` on a post where `x.likeState()` is `missing` (neither `like` nor `unlike` present) shows `Like control not found.` once per page load. `liked` stays silent (today's behavior).

`x.health({ root })` returns `{ post: n, withId: n, ads: n, like: n, liked: n, caret: n, avatar: n, column: boolean, forYou: boolean }` counts for the given root. `main.js` uses it for the condition above; the probe prints it.

## 4. Testing

Three tiers. Tier 1 is new; tier 2 exists and is reorganized; tier 3 is new and manual.

### 4.1 Unit tests (`planned`, Phase 3) — `tests/unit/*.test.mjs`, `node --test`

Classic scripts cannot be `import`ed. `tests/unit/load.mjs` loads them the way Chrome does:

```js
import { readFileSync } from "node:fs";
import vm from "node:vm";
export function load({ files, globals }) {
  const context = vm.createContext({
    ...globals,
    performance,
    setTimeout,
    clearTimeout,
  });
  for (const file of files)
    vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
  return context.__wheel;
}
```

Tests pass a fake `wheel.x` (an object with the same interface returning plain objects) by pre-seeding `globals.__wheel = { x: fakeX }`; the real `x.js` is simply not in `files`. What is unit-tested:

- `feed.js`: grouping from a fake `x.isConversationRail`; neighbor selection; `reconcile` with synthetic mutation records; suppression release rules.
- `feedback.js`: every row of the transition and interrupt tables; the five invariants; timing via injected `now`/`sleep`.
- `input.js`: the gating order, using synthetic event objects.

Not unit-tested: anything needing layout (`getBoundingClientRect`, scroll, snap). Those stay in tier 2.

Command: `node --test tests/unit/` from the repository root (`npm run test:unit`, `planned`). Exit 0 and a TAP summary with 0 failures is done.

### 4.2 Browser tests (`built`, reorganized in Phase 5)

Keep Playwright for alignment, snap, wheel release, mutation batching, and the end-to-end flows on the synthetic feed. Changes:

- `tests/helpers.mjs` exports `inject({ page })`: reads `extension/manifest.json`, `addStyleTag` for each CSS, `addScriptTag` for each JS in order. All three spec files use it; no spec names `content.js`.
- Split `wheel.spec.mjs` into `feedback.spec.mjs`, `undo.spec.mjs`, `selection.spec.mjs`, `grouping.spec.mjs`, `input.spec.mjs`, keeping test names unchanged so history is searchable. `navigation.spec.mjs` and `extension.spec.mjs` stay.
- Delete the `.wheel-button` assertions.
- `playwright.config.mjs`: `testDir` stays `./tests`; add `testIgnore: ["**/unit/**"]`.

Command: `npm test`. Done is every test passing; today's known timing-sensitive tests are the ones with `menuDelay`/`itemDelay` — if one flakes once, rerun once before treating it as a regression.

### 4.3 Extension smoke (`built`)

`tests/extension.spec.mjs` loads the real unpacked `extension/` and so verifies the manifest `js` order actually works in Chrome. No change beyond the helper and the dead assertion. It is the only test that catches a file missing from the manifest.

### 4.4 Checks in `npm run check`

Today: vet. After Phase 2: vet, then `node scripts/layers.mjs`. Exit codes keep vet's convention (1 violations, 2 setup).

## 5. Live contract probe (`planned`, Phase 6) — `scripts/probe-live.mjs`

Purpose: detect X drift before a user does. It is the only check that touches real X. It is **read-only** and **manual**; it never runs in CI and never clicks, likes, dismisses, scrolls past what is needed, or records post content.

Run from the repository root with a logged-in Chrome profile copy or a dedicated profile directory:

```
WHEEL_PROFILE_DIR=~/wheel-probe-profile node scripts/probe-live.mjs
```

Behavior:

1. Launch a Playwright persistent context on `WHEEL_PROFILE_DIR` (fail with exit 2 and a message naming the variable if unset or missing). First run: the user logs in by hand in the opened window and presses Enter in the terminal.
2. Open `https://x.com/home`. Wait until `x.onForYou()` is true or 20 s pass (exit 1: `For You not detected` — rows 3–4).
3. Inject `x.js` only (via `addScriptTag`) and call `x.health({ root: document })` plus one `x.feedbackItem`-shaped check **without opening a menu**: assert that the first visible post has a caret (row 10). Menu and label rows (11–12) cannot be probed without a click; print `not probed` for them.
4. Scroll at most three viewports to find one conversation (two adjacent cells); report `isConversationRail` result and, on failure, which threshold in `contract.rail` failed.
5. Print JSON: counts from `health`, booleans per row 1–10 and 14–16, and `not probed` for 11–13. Content is never printed: no text, handles, or IDs — only counts and booleans. This is the AGENTS.md privacy rule applied to a script.
6. Exit 0 when every probed row passes; exit 1 listing failing rows by number.

Use: before `npm run package` for a release, and whenever a user reports breakage. A failing row tells you which `contract` entry to update; the fix is a change in `x.js`, then `npm run check && npm test`, then the probe again.

## 6. Migration phases

Each phase ends with the AGENTS.md check sequence green: `npm run check && npm run test:vet && npm test && npm run package`. Phases are ordered by payoff over risk; stop after any phase and the repository is releasable. One commit per phase minimum; commit message prefixes as in `git log`.

### Phase 0 — settle the baseline

The working tree has uncommitted edits to `extension/content.js` (396 insertions, 380 deletions versus `10515f1`: helper reorganization such as `hrefId`, `primaryColumn`, `isAd`, `byKey`, plus the section banners) and an untracked `wheel-src.tgz` at the root. This plan was written against the working-tree version.

- Run the check sequence on the working tree. If green, commit it (`refactor(wheel): group helpers and constants`). If not, decide with the owner whether to fix or `git checkout -- extension/content.js`; do not start Phase 1 on a red baseline.
- `wheel-src.tgz`: decision for the owner (§8). It is not shipped (packaging reads only `extension/`), but it is unignored, so `vet` would check any `.js` inside it if extracted, and `git add -A` would commit it.

Done when: `git status --short` is empty and the check sequence passes.

### Phase 1 — extract `x.js` (pure code motion)

- Create `extension/x.js` with the `contract` table and every function in §3.3 x.js, moving the bodies from `content.js` unchanged (`own`, `hrefId`, `postKey` → `postId`, `primaryColumn` → `column`, `isAd`, `isAvatarRail`+`continuesConversation`'s DOM half → `isConversationRail`, `onForYou`, `overlayOpen`, `typing` → `typingContext`, `feedbackItem`, `closeMenu`, the DOM half of `undoControls`, the `like`/`caret` lookups out of `likePost`/`dismiss`).
- `content.js` reads `const x = globalThis.__wheel.x;` at the top and calls through. No logic change. `continuesConversation`'s cell-adjacency check moves too (it is row 2 + row 8).
- `manifest.json`: `"js": ["x.js", "content.js"]`.
- Tests: `tests/wheel.spec.mjs` `start()` and `tests/navigation.spec.mjs` `openFeed()` inject `x.js` before `content.js` (temporary; replaced by the manifest-driven helper in Phase 5). `extension.spec.mjs` needs no change and proves the manifest order.

Done when: check sequence green; `grep -n 'data-testid' extension/content.js` prints nothing. Risk: low — behavior is identical; the only failure mode is a missed reference, which the browser tests catch immediately.

### Phase 2 — enforce the layer rule

- Add `scripts/layers.mjs` per §3.2 and `scripts/layers.test.mjs` (`node --test`) covering: a clean tree passes; a planted `data-testid` in a non-`x.js` file fails with the file and line; a `wheel.feedback` reference from `feed.js` fails; a manifest/disk mismatch exits 2.
- `package.json`: `"check": "npm run vet && node scripts/layers.mjs"`, `"test:vet": "node --test scripts/vet.test.mjs scripts/layers.test.mjs"` so AGENTS.md's four-command sequence is unchanged.
- Until Phase 4, `content.js` is exempt from Rule B (it legitimately references everything); the exemption is a one-line allowlist entry that Phase 4 deletes.

Done when: `npm run check` prints both `vet:` and `layers:` success lines; planted violations fail in the test.

### Phase 3 — the feedback state machine, unit tests first

- Write `tests/unit/load.mjs` and `tests/unit/feedback.test.mjs` **before** touching `dismiss()`. Derive the cases from the existing browser tests whose names start with `regression:`, `navigation cancels`, `Escape cancels`, `post recycling`, `does not touch an already open`, `holding n`, and the `undo shortcut:` group — one unit case per row of the two tables in §3.3.
- Create `extension/feedback.js` implementing the machine with injected `{ x, ui, feed, selection, now, sleep }` dependencies resolved from `wheel.*` at call time (so the unit loader can substitute fakes by seeding `__wheel`).
- Move `likePost`, `likeCurrent`, `undoControls`' logic half, `undoDismissal`, `waitFor`, `cancelFeedback`, `dismiss`, `dismissCurrent` out of `content.js`. `content.js` keeps selection/feed/input/main for now and calls `wheel.feedback.*`.
- `manifest.json`: `["x.js", "ui.js", "feedback.js", "content.js"]` — `ui.js` is created here because feedback needs `notify`.

Done when: `npm run test:unit` passes with a case per table row; browser suite green with no test edited except injection order. If a browser test and a unit test disagree, the browser test is the oracle — the unit case was derived wrongly; fix the case, not the behavior.

### Phase 4 — finish the split

- Create `feed.js`, `selection.js`, `input.js`, `main.js` from the remaining sections of `content.js`; delete `content.js`; manifest becomes the §3.1 list; remove the Rule B exemption.
- Add the drift check (§3.5) in `main.js` and `x.health`/`x.likeState` in `x.js`. Add one browser test per notice: a fixture with articles that lack `data-testid="tweet"` shows the drift notice; a post with neither like control shows `Like control not found.`; a liked post stays silent.
- CSS: `--wheel-header-height` per §3.3.
- `tests/unit/feed.test.mjs`, `tests/unit/input.test.mjs`.

Done when: `ls extension/` is exactly `content.css manifest.json x.js ui.js feed.js selection.js feedback.js input.js main.js`; check sequence green; `npm run test:unit` green.

### Phase 5 — test reorganization

Per §4.2: `tests/helpers.mjs` with manifest-driven `inject`, split `wheel.spec.mjs`, delete `.wheel-button` assertions, `testIgnore` for unit tests. No test names change.

Done when: `npm test` reports the same number of tests as before Phase 5 (splitting moves tests, it does not remove them) and `grep -rn wheel-button tests/` prints nothing.

### Phase 6 — live probe

Per §5. Add `"probe:live": "node scripts/probe-live.mjs"` to `package.json`. Not in CI. Document in README "Development" in two lines and in AGENTS.md as a step to report separately (AGENTS.md already says live verification is reported separately).

Done when: the script exits 2 with a clear message when `WHEEL_PROFILE_DIR` is unset, and the owner has run it once against live X and recorded the row results in the PR description (counts and booleans only).

### Phase 7 — documentation

- Rewrite `docs/architecture.md` "Layout and loading" for the module list and dependency rule; add a "When X changes" section: run the probe → edit `contract` in `x.js` → check sequence → probe → bump `manifest.json` version → package. Keep the rest; most of it is still true.
- `AGENTS.md`: add `npm run test:unit` to the required sequence; add the layer rule in one line ("only `extension/x.js` may contain X selectors or labels; `npm run check` enforces it"); link this plan; mark this plan `done` or delete it.
- README: add the probe command under Development; no behavior text changes.

Done when: every command in the three docs has been run from the repository root in this phase, and `docs/resilience-plan.md` either says `done` at the top or is removed.

## 7. Rules for whoever executes this (human or agent)

- Work one phase at a time, in order. Do not start a phase with the previous phase's checks red.
- Boundaries: a phase may change only the files it names plus `package.json` scripts and `manifest.json`. `tests/feed.js` and `tests/feed.html` (the synthetic X) change only in Phase 4, and only to add fixtures for the two drift notices.
- No new runtime dependency, no bundler, no TypeScript, no `"type": "module"` in the manifest. If a step seems to need one, stop and report; the plan is wrong, not the constraint.
- Do not add a second `candidates` entry to any `contract` row without a probe result showing the new form on live X. Reason: an unverified selector can target the wrong control.
- Do not change the text of any notice that exists today, or add a notice not named in §3.5. Reason: README and tests describe them.
- Retries: AGENTS.md's rule applies — at most two retries for the same failure, then report the command and error and continue with independent work.
- If a browser test and this plan disagree about current behavior, the test is right. Fix the plan in the same commit.
- Report per phase: files changed; the check sequence output; unit test count; anything in this plan that turned out to be wrong.

## 8. Decisions for the owner

1. **Baseline**: commit the current working-tree `content.js` (if green) or discard it. Default if unanswered: commit if green.
2. **`wheel-src.tgz`**: delete, or add `*.tgz` outside `vendor/` to `.gitignore`. Default: nothing — leave it and report it each phase until decided.
3. **Drift notice wording** in §3.5. Default: the two strings given there.
4. **Row 6 (ads)**: accept the soft spot as described in §3.4, or add a stricter rule (e.g., treat any post whose menu lacks an exact feedback label as non-dismissable — already true) — no further mitigation is proposed. Default: accept.
5. **Probe profile**: a dedicated test account or the owner's own profile copy. The probe reads only; either works. Default: owner decides at Phase 6.
6. **`check` composition**: whether `npm run check` or a new `npm run check:all` runs layers. Default: `check` runs both, so AGENTS.md's sequence stays four commands.

## Appendix — verification status of commands in this document

Run on 2026-10-31 from the repository root in the planning environment (a VM with the repository mounted, Node 22, no Playwright browsers installed):

- `node scripts/vet.mjs` — passed (`vet: 11 files checked; no violations.`).
- `npm test`, `npm run package`, `npm run test:vet` — `unverified` here: no Chromium in the planning VM; `zip` present. Run them on the development machine in Phase 0.
- Every command under `planned` sections (`layers.mjs`, `test:unit`, `probe:live`) does not exist yet.
