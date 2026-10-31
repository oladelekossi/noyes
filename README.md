# noyes

Fine-tune your X feed from the keyboard.

Move through **For You**, like posts, and send **Not interested** feedback. A green outline marks the selected post or connected conversation. X handles dismissal, confirmation, follow-up questions, and Undo.

No settings, accounts, API keys, build step, or automatic feed browsing.

> **Status:** early release. Navigation and selection are verified on live X; like and Not-interested dispatch are tested against a synthetic feed only. X can change its page at any time and break noyes until it is updated. Please [report breakage](https://github.com/oladelekossi/noyes/issues).

## Install locally

For Chrome and Chromium-based browsers:

1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the repository's **extension** folder.
4. Refresh X, open **For You**, and press `k` to select a post.

After changing extension files, click **Reload** on noyes's extension card and refresh each X tab where you use it.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `k` | Next post or conversation |
| `j` | Previous post or conversation; restore a dismissed predecessor through native Undo |
| `l` | Like, then select the next post (never unlike) |
| `n` | Not interested, or skip when feedback is unavailable |
| `u` | Undo the latest `n` dismissal while X still offers Undo |

The first navigation key selects the first visible post. Navigation puts its top below the feed header and briefly corrects feed shifts. If an ad or gap fills the viewport, or there is no loaded neighboring post, each `j`/`k` press scrolls one screen in that direction so you can reach more posts. Loading alone never triggers another scroll. After you manually scroll past the selection, the next shortcut starts from the visible feed. `l` and `n` act only on a visible post; `l` advances past already-liked posts and stays put at the last loaded post.

Connected conversations form one navigation item. Their green outline spans the context and reply; likes and feedback target the last displayed reply. Grouping uses a shared feed cell or visible avatar connector, never mentions alone.

`n` advances when it clicks X's native feedback action. If that action is missing or unrecognized, it closes its menu, skips with a notice that nothing was sent, and leaves the post unchanged.

Going backward with `j` restores a dismissed predecessor through X's native Undo when it lies between the current post and the previous ordinary post. Consecutive `j` presses can restore consecutive dismissals in feed order. This works only while the original native Undo remains available and unambiguous; otherwise noyes shows `Undo unavailable.` and continues normal backward navigation. After manually scrolling away or clearing selection, the first navigation key starts from the visible feed without automatically undoing anything.

`u` selects the restored post after using X's native Undo. It targets only the latest successful `n`, once; it does not walk older dismissals or undo likes. Restoring that same post with `j` consumes its `u` entry too. During a pending `n`, `u` cancels that action instead.

## Limits and cancellation

- Supports X's **English desktop web interface** on `x.com` and `twitter.com`, only in **For You**. It does not modify the native phone app.
- Shortcuts stay inactive while typing or using a dialog/menu. Modifiers and held-key repeats do not trigger actions. noyes takes precedence over X's native shortcuts for these five keys in this context.
- No extra post buttons are added. A native menu may briefly appear during feedback; follow-up prompts stay under your control.
- Navigation, key presses, clicks elsewhere, scrolling, and touch cancel feedback that has not been dispatched. Cancellation does not advance selection or pull you back. noyes closes its own abandoned menu when it can identify it and preserves menus you open yourself.
- noyes never substitutes mute, block, report, or ad feedback for Not interested.
- If X changes its page so noyes can no longer recognize posts, noyes shows a notice once and its shortcuts do nothing until noyes is updated.
- X controls recommendation changes and can change its page structure or wording. noyes cannot guarantee compatibility or how much your recommendations change.

## Privacy

noyes runs only on X/Twitter pages and reads the displayed DOM to carry out your requested action. It has no analytics, storage, backend, external requests, or third-party runtime dependencies. Feedback uses X's own interface.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and how to file a useful bug report. Coding agents should read [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE). noyes is not affiliated with or endorsed by X Corp.
