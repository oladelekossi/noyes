import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load.mjs";

// Posts are plain objects; `rails` lists the post pairs X joins with an
// avatar rail. Geometry is a top/bottom pair in viewport pixels.
function setup({ posts, rails = [], column = true }) {
  const byId = new Map(posts.map((post) => [post.id, post]));
  for (const post of posts) {
    post.isConnected ??= true;
    post.visible ??= true;
    post.top ??= 0;
    post.bottom ??= 100;
    post.time ??= { id: post.id };
    post.getBoundingClientRect = () => ({ top: post.top, bottom: post.bottom });
  }
  const x = {
    layout: { headerHeight: 100, bottomMargin: 32 },
    column: () => (column ? { posts } : null),
    posts: ({ root }) => root.posts,
    postId: ({ post }) => post.id,
    visible: (post) => post.visible,
    isAd: ({ post }) => !!post.ad,
    isConversationRail: ({ post, next }) =>
      rails.some(([a, b]) => a === post.id && b === next.id),
    timestamp: ({ post }) => post.time,
    timestamps: ({ node }) => node.times || [],
    timestampId: ({ time }) => time.id,
  };
  const noyes = load({
    files: ["feed.js"],
    globals: { __noyes: { x }, innerHeight: 820 },
  });
  return { feed: noyes.feed, byId };
}

// Arrays made inside the vm context have that realm's prototype.
const keys = (items) => [...items].map((item) => item.key);
const shape = (items) =>
  [...items].map((item) => ({
    key: item.key,
    head: item.head.id,
    target: item.target.id,
    articles: [...item.articles].map((post) => post.id),
  }));

test("read: a rail joins posts into one item keyed by its last post", () => {
  const { feed } = setup({
    posts: [{ id: "1" }, { id: "2" }, { id: "3" }],
    rails: [["1", "2"]],
  });
  assert.deepEqual(shape(feed.read()), [
    { key: "2", head: "1", target: "2", articles: ["1", "2"] },
    { key: "3", head: "3", target: "3", articles: ["3"] },
  ]);
});

for (const [name, skipped] of [
  ["an ad", { ad: true }],
  ["a hidden post", { visible: false }],
  ["a post without an ID", { id: undefined }],
])
  test(`read: ${name} is skipped and breaks a conversation`, () => {
    const { feed } = setup({
      posts: [{ id: "1" }, { id: "2", ...skipped }, { id: "3" }],
      rails: [
        ["1", "2"],
        ["2", "3"],
        ["1", "3"],
      ],
    });
    assert.deepEqual(keys(feed.read()), ["1", "3"]);
  });

test("read: no column means no items", () => {
  const { feed } = setup({ posts: [{ id: "1" }], column: false });
  assert.deepEqual(keys(feed.read()), []);
});

test("suppress hides a post until released; a new ID on the node shows it", () => {
  const { feed, byId } = setup({ posts: [{ id: "1" }, { id: "2" }] });
  feed.suppress({ post: byId.get("1"), key: "1" });
  assert.deepEqual(keys(feed.read()), ["2"]);
  assert.equal(feed.isSuppressed({ post: byId.get("1"), key: "1" }), true);
  byId.get("1").id = "9";
  assert.deepEqual(keys(feed.read()), ["9", "2"]);
  byId.get("1").id = "1";
  feed.release({ post: byId.get("1") });
  assert.deepEqual(keys(feed.read()), ["1", "2"]);
});

test("current: the selection while on screen, else the first visible item", () => {
  const { feed } = setup({
    posts: [
      { id: "1", top: -300, bottom: 50 },
      { id: "2", top: 50, bottom: 400 },
      { id: "3", top: 400, bottom: 700 },
      { id: "4", top: 800, bottom: 1100 },
    ],
  });
  const items = feed.read();
  assert.equal(feed.current({ items, selectionKey: "3" }).key, "3");
  assert.equal(feed.current({ items, selectionKey: "4" }).key, "2");
  assert.equal(feed.current({ items, selectionKey: null }).key, "2");
});

const contains = (time) => ({ contains: (node) => node === time });

test("reconcile: a same-ID rerender keeps suppression and follows the timestamp", () => {
  const { feed, byId } = setup({ posts: [{ id: "1" }, { id: "2" }] });
  const post = byId.get("1");
  feed.suppress({ post, key: "1" });
  const fresh = { id: "1" };
  feed.reconcile({
    records: [
      {
        removedNodes: [contains(post.time)],
        addedNodes: [{ times: [fresh] }],
        target: {},
      },
    ],
  });
  assert.equal(feed.isSuppressed({ post, key: "1" }), true);
  // The followed timestamp is the one later removals are matched against.
  feed.reconcile({
    records: [{ removedNodes: [contains(fresh)], addedNodes: [], target: {} }],
  });
  assert.equal(feed.isSuppressed({ post, key: "1" }), false);
});

test("reconcile: removal without a same-ID replacement releases", () => {
  const { feed, byId } = setup({ posts: [{ id: "1" }] });
  const post = byId.get("1");
  feed.suppress({ post, key: "1" });
  feed.reconcile({
    records: [
      {
        removedNodes: [contains(post.time)],
        addedNodes: [{ times: [{ id: "2" }] }],
        target: {},
      },
    ],
  });
  assert.equal(feed.isSuppressed({ post, key: "1" }), false);
});

for (const [name, change] of [
  ["disconnected", (post) => (post.isConnected = false)],
  ["recycled to another ID", (post) => (post.id = "7")],
  ["hidden", (post) => (post.visible = false)],
])
  test(`reconcile: a ${name} post is released`, () => {
    const { feed, byId } = setup({ posts: [{ id: "1" }] });
    const post = byId.get("1");
    feed.suppress({ post, key: "1" });
    change(post);
    feed.reconcile({ records: [] });
    post.id = "1";
    post.isConnected = true;
    post.visible = true;
    assert.equal(feed.isSuppressed({ post, key: "1" }), false);
  });
