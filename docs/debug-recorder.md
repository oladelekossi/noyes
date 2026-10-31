# Recording a navigation bug

Use the development-only flight recorder when a green outline disappears or navigation jumps unexpectedly. It records ordered inputs and measured state, rather than screenshots or post content. The normal extension and its ZIP do not include this recorder.

## Setup

From the repository root:

```sh
npm run debug:build
```

1. In Chrome's `chrome://extensions`, disable the regular noyes extension so two copies cannot handle the same key.
2. Choose **Load unpacked** and select this repository's **dist/noyes-debug** directory.
3. Refresh X and open **For You**. A small **noyes flight recorder** panel appears at the bottom right.
4. Click **Record**, then navigate as usual. Click **Bug here** when you notice the problem; you can mark more than once. The recorder's controls do not cancel noyes's pending action or alignment.
5. Click **Stop**, then **Export replay**. Keep the downloaded HTML file and send it back for investigation. Open it locally to scrub, step through events, jump to bug markers, or save the embedded JSON.

Export before refreshing or navigating away. Recordings live in the tab's memory until export and cannot survive a reload or browser crash. The recorder stops automatically after ten minutes, 18,000 events, or roughly 24 MiB of serialized state, whichever comes first. A truncated post inventory is flagged when more than 250 recognized posts are loaded. Export before starting a new recording; starting again discards the previous one after confirmation.

Re-run `npm run debug:build` after source changes, reload this debug extension in Chrome, and refresh X. When finished, disable the debug extension and re-enable regular noyes, then refresh X.

## What the recording tells us

Each record has a sequence number and a monotonic timestamp. It captures:

- Key down/up before and after dispatch, repeat/composition/modifier flags, and whether noyes prevented the event. Only noyes shortcut names and Escape are retained; other keys become `other`, and keystrokes in typing contexts are omitted entirely.
- Before/after public selection, navigation, feedback, and suppression calls. Internal calls within module closures are not separately wrapped. Async feedback settlement appears in later DOM batches or state samples; a method returning a Promise is not logged as completed feedback.
- The selected identity, feed item groups, per-article DOM-node identities, suppression, outline classes and computed styles, geometry, scroll position, pending feedback and state, the most recent feedback outcome, alignment, focus, overlays, and adapter health counts.
- Visible native menu diagnostics: item counts, whether an exact enabled feedback action matches, and whether related feedback text appears. These are counts and booleans; raw menu wording is never exported. Related text is diagnostic only and never broadens which native action noyes clicks.
- DOM mutation batch counts and the state observed at that callback, plus changed state sampled every 200 ms. Removing and replacing a post can be distinguished by its stable anonymous identity and changing node number when those states are observed.
- A fingerprint of the extension's JavaScript and CSS, bug markers, error/rejection counts, and why recording stopped. Error messages and stack traces are omitted because they may contain private content.

Post identities are replaced with session-local names such as `post-1`; DOM nodes get separate numbers. The export contains no post text, handles, URLs, raw post IDs, screenshots, cookies, tokens, request data, or typed content. The recorder has no server or network requests. The HTML contains its own replay code and data and works offline.

## Determinism and limits

**Playback of the recorded state is deterministic. Reproduction of the bug is a separate step.** The replay paints anonymous boxes from captured geometry; it does not run X, restore its DOM, or rerun noyes. It shows whether the selection was absent, unmounted, offscreen, missing its class, or missing its computed outline style at the recorded moments. Geometry and computed styles do not establish pixel visibility or rule out occlusion by another element.

The recorder observes DOM batches after mutations, method boundaries, user events, and periodic samples. It does not capture every animation frame or every intermediate mutation, X's network timing, the browser's scroll implementation, arbitrary console output, or private state inside module closures. Instrumentation also adds work and may change the timing of a race. A transient state during a selection method is not necessarily a bug; compare the before/after pair and later samples, and use the bug marker as the starting point.

After a recording identifies the transition, reproduce the smallest relevant sequence in the synthetic feed (for example, select an item, recycle its node, remove its successor, then press `k`). Add a browser regression test that fails before the fix and passes after it. That test is the deterministic reproducer. Replaying the same keys against live X alone cannot provide that guarantee.

## Verification

`npm test` includes recorder tests for consumed shortcuts, typing privacy, node replacement and selected-post removal, marked HTML replay export, controls preserving alignment, and automatic injection in Chrome's isolated content-script world. These use synthetic posts only; they do not establish live X behavior.

The 0.2.1 recording that motivated backward restoration had a repeatable menu lookup timeout, but lacked menu classification. Its data cannot distinguish an absent option from a changed label or structure. New recordings can separate those cases without saving menu text. An unavailable lookup now states that no feedback was sent; it does not claim X accepted a dismissal.
