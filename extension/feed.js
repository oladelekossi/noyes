// The feed model: X's posts as navigation items. A conversation joined by
// X's avatar rail is one item; ads, quoted posts, and posts noyes just
// dismissed are not items.
(() => {
  "use strict";
  const noyes = (globalThis.__noyes ??= {});
  if (noyes.feed) return;

  // Dismissed posts stay out of navigation until X replaces or removes them.
  // post → { key, time }: `time` is followed across same-ID rerenders.
  const dismissedPosts = new Map();

  const byKey = (key) => (item) => item.key === key;

  // → [{ key, head, target, articles }] in DOM order. `head` is the first
  // article of a conversation, `target` the last (the one actions apply to).
  function read() {
    const x = noyes.x;
    const column = x.column();
    if (!column) return [];
    const items = [];
    let previous = null;
    for (const post of x.posts({ root: column })) {
      const key = x.postId({ post });
      if (
        !x.visible(post) ||
        !key ||
        isSuppressed({ post, key }) ||
        x.isAd({ post })
      ) {
        previous = null;
        continue;
      }
      if (previous && x.isConversationRail({ post: previous, next: post })) {
        const item = items.at(-1);
        item.articles.push(post);
        item.target = post;
        item.key = key;
      } else items.push({ key, target: post, head: post, articles: [post] });
      previous = post;
    }
    return items;
  }

  function inViewport({ item }) {
    const { headerHeight, bottomMargin } = noyes.x.layout;
    return (
      item.target.getBoundingClientRect().bottom > headerHeight &&
      item.head.getBoundingClientRect().top < innerHeight - bottomMargin
    );
  }

  // The selected item while it is on screen, else the first visible item.
  function current({ items, selectionKey }) {
    const selected = selectionKey && items.find(byKey(selectionKey));
    if (selected && inViewport({ item: selected })) return selected;
    return items.find((item) => inViewport({ item }));
  }

  function suppress({ post, key }) {
    dismissedPosts.set(post, { key, time: noyes.x.timestamp({ post }) });
  }

  function release({ post }) {
    dismissedPosts.delete(post);
  }

  function isSuppressed({ post, key }) {
    return dismissedPosts.get(post)?.key === key;
  }

  // An atomic same-ID replacement is a rerender, not an Undo. Follow its
  // timestamp through the mutation batch; a removal without replacement is
  // the native result transition, even if Undo restores it in the same batch.
  function reconcile({ records }) {
    const x = noyes.x;
    for (const [post, dismissed] of dismissedPosts) {
      if (
        !post.isConnected ||
        x.postId({ post }) !== dismissed.key ||
        !x.visible(post)
      ) {
        dismissedPosts.delete(post);
        continue;
      }
      for (const record of records) {
        const removed = [...record.removedNodes].some((node) =>
          node.contains(dismissed.time),
        );
        if (!removed) continue;
        const replacement = [...record.addedNodes]
          .flatMap((node) => x.timestamps({ node }))
          .find(
            (time) =>
              x.timestampId({ time, target: record.target }) === dismissed.key,
          );
        if (!replacement) {
          dismissedPosts.delete(post);
          break;
        }
        dismissed.time = replacement;
      }
    }
  }

  noyes.feed = Object.freeze({
    read,
    inViewport,
    current,
    suppress,
    release,
    isSuppressed,
    reconcile,
  });
})();
