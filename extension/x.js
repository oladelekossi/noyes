// The X adapter: the only file that knows what X's page looks like.
// When X changes markup, wording, or layout, the fix belongs in `contract`
// below (and, rarely, in a lookup here) — never in the other modules.
(() => {
  "use strict";
  const wheel = (globalThis.__wheel ??= {});
  if (wheel.x) return;

  // Each `candidates` list is ordered; a lookup uses the first match. Add a
  // second entry only when the live probe shows X shipping a new form
  // alongside the old one: an unverified fallback can match the wrong element.
  const contract = Object.freeze({
    post: { candidates: ['article[data-testid="tweet"]'] },
    cell: { candidates: ['[data-testid="cellInnerDiv"]'] },
    column: { candidates: ['[data-testid="primaryColumn"]'] },
    statusHref: { pattern: /\/status\/(\d+)/ },
    ad: {
      wrapper: ['[data-testid="placementTracking"]'],
      candidates: ['[data-testid="promotedIndicator"]'],
    },
    avatar: { candidates: ['[data-testid="Tweet-User-Avatar"]'] },
    // X's conversation connector: an empty, painted, thin vertical line
    // centered under the avatar that reaches the post's bottom edge.
    rail: {
      minWidth: 1,
      maxWidth: 3,
      minHeight: 8,
      centerTolerance: 4,
      edgeTolerance: 4,
    },
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
    feedbackDiagnosticPhrase: "not interested",
    undoLabel: "undo",
    forYouLabel: "for you",
    tab: '[role="tab"][aria-selected="true"]',
    overlay: {
      candidates: ['[role="menu"]', '[role="dialog"]', '[aria-modal="true"]'],
    },
    typing:
      'input, textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"]',
    button: 'button, [role="button"]',
  });

  // X's sticky header height and the bottom margin wheel keeps clear.
  const layout = Object.freeze({ headerHeight: 100, bottomMargin: 32 });
  // Poll only during a user-requested action, without automatic retry.
  const timing = Object.freeze({
    menuTimeout: 1600,
    pollInterval: 40,
    restoreTimeout: 1500,
  });

  const any = (selectors) => selectors.join(", ");
  const POST = any(contract.post.candidates);
  const CELL = any(contract.cell.candidates);
  const MENU = any(contract.menu.candidates);

  const normalize = (text) => text.replace(/\s+/g, " ").trim().toLowerCase();
  const visible = (element) =>
    element.isConnected &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== "hidden";
  const enabled = (element) =>
    !element.disabled && element.getAttribute("aria-disabled") !== "true";
  const faded = (element) => {
    for (let node = element; node; node = node.parentElement) {
      if (Number(getComputedStyle(node).opacity) === 0) return true;
    }
    return false;
  };
  const first = ({ root, selectors }) => {
    for (const selector of selectors) {
      const match = root.querySelector(selector);
      if (match) return match;
    }
    return null;
  };
  // Match inside a post but not inside a nested (quoted) post.
  const own = ({ post, selectors }) => {
    for (const selector of selectors) {
      const match = [...post.querySelectorAll(selector)].find(
        (element) => element.closest(POST) === post,
      );
      if (match) return match;
    }
    return undefined;
  };
  const hrefId = (anchor) =>
    anchor?.getAttribute("href")?.match(contract.statusHref.pattern)?.[1];

  const timestamp = ({ post }) => own({ post, selectors: ["time"] });
  const postId = ({ post }) => hrefId(timestamp({ post })?.closest("a[href]"));
  const column = () =>
    first({ root: document, selectors: contract.column.candidates });

  // Timestamps in a mutation's added node, for following a rerendered post.
  const timestamps = ({ node }) =>
    node instanceof Element
      ? node.matches("time")
        ? [node]
        : [...node.querySelectorAll("time")]
      : [];
  const timestampId = ({ time, target }) =>
    hrefId(time.closest("a[href]") || target.closest?.("a[href]"));

  function onForYou() {
    if (location.pathname.replace(/\/$/, "") !== "/home") return false;
    const primary = column();
    return (
      !!primary &&
      [...primary.querySelectorAll(contract.tab)].some(
        (tab) =>
          visible(tab) && normalize(tab.textContent) === contract.forYouLabel,
      )
    );
  }

  // Top-level posts in DOM order; quoted (nested) posts are excluded.
  const posts = ({ root }) =>
    [...root.querySelectorAll(POST)].filter(
      (post) => !post.parentElement.closest(POST),
    );

  // A placement wrapper around the article identifies an ad. A tracker
  // inside the article also appears on ordinary videos, including quotes,
  // so descendant placement tracking is not ad evidence. Indicators must
  // belong to this post, not to an embedded quoted article.
  const isAd = ({ post }) =>
    !!(
      post.closest(any(contract.ad.wrapper)) ||
      own({ post, selectors: contract.ad.candidates })
    );

  const cell = ({ post }) => post.closest(CELL);
  const avatar = ({ post }) =>
    own({ post, selectors: contract.avatar.candidates });

  function isRailLine({ line, avatarRect, postRect }) {
    const limits = contract.rail;
    const rail = line.getBoundingClientRect();
    const centered =
      Math.abs(
        rail.left + rail.width / 2 - (avatarRect.left + avatarRect.width / 2),
      ) < limits.centerTolerance;
    if (
      rail.width < limits.minWidth ||
      rail.width > limits.maxWidth ||
      rail.height <= limits.minHeight ||
      !centered ||
      rail.top < avatarRect.bottom - limits.edgeTolerance ||
      Math.abs(rail.bottom - postRect.bottom) > limits.edgeTolerance
    )
      return false;
    const background = getComputedStyle(line).backgroundColor;
    return (
      visible(line) &&
      background !== "transparent" &&
      background !== "rgba(0, 0, 0, 0)" &&
      !faded(line)
    );
  }

  // Separate virtualized cells are joined only by X's visible avatar rail.
  // Mentions, authors, and nearby timestamps are not conversation evidence.
  function isConversationRail({ post, next }) {
    const postCell = cell({ post });
    const nextCell = cell({ post: next });
    if (postCell && postCell === nextCell) return true;
    if (!postCell || postCell.nextElementSibling !== nextCell) return false;
    const image = avatar({ post });
    if (!image) return false;
    const postRect = post.getBoundingClientRect();
    if (
      Math.abs(next.getBoundingClientRect().top - postRect.bottom) >
      contract.rail.edgeTolerance
    )
      return false;
    const avatarRect = image.getBoundingClientRect();
    return [...post.querySelectorAll("div")].some(
      (line) =>
        !line.childElementCount &&
        line.closest(POST) === post &&
        isRailLine({ line, avatarRect, postRect }),
    );
  }

  // "l" means like, not toggle: only the native like control, never unlike.
  function likeControl({ post }) {
    const like = own({ post, selectors: contract.like.candidates });
    return like && visible(like) && enabled(like) ? like : null;
  }

  // "like" | "liked" | "missing": missing means X no longer shows either
  // control where wheel expects it, which is drift rather than a liked post.
  function likeState({ post }) {
    if (own({ post, selectors: contract.like.candidates })) return "like";
    if (own({ post, selectors: contract.like.liked })) return "liked";
    return "missing";
  }

  function caret({ post }) {
    const element = own({ post, selectors: contract.caret.candidates });
    return element && visible(element) ? element : null;
  }

  const menus = ({ root }) => [...root.querySelectorAll(MENU)];
  // The visible native menu containing an element, if any.
  const menuAt = ({ element }) => {
    const menu = element?.closest?.(MENU);
    return menu && visible(menu) ? menu : null;
  };

  // Exact labels only: never guess from an icon or click the first menu item.
  const feedbackItem = ({ menu }) =>
    [...menu.querySelectorAll(contract.menu.item)].find(
      (element) =>
        visible(element) &&
        enabled(element) &&
        contract.feedbackLabels.includes(normalize(element.textContent)),
    );

  // Counts and booleans only. Related text is diagnostic evidence, never
  // permission to dispatch an option that failed the exact action match.
  const menuDiagnostics = ({ menu }) => ({
    itemCount: [...menu.querySelectorAll(contract.menu.item)].filter(visible)
      .length,
    hasExactFeedback: !!feedbackItem({ menu }),
    hasFeedbackText: normalize(menu.textContent).includes(
      contract.feedbackDiagnosticPhrase,
    ),
  });

  function closeMenu({ menu }) {
    if (!menu?.isConnected || !visible(menu)) return;
    for (const type of ["keydown", "keyup"])
      menu.dispatchEvent(
        new KeyboardEvent(type, {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          which: 27,
          bubbles: true,
        }),
      );
  }

  // Native Undo controls inside the dismissed post's cell, excluding recycled
  // posts, unrelated or quoted controls, and anything hidden or disabled.
  function undoControls({ post, scope }) {
    if (!scope?.isConnected) return [];
    const stillShowing = post.isConnected
      ? !!postId({ post })
      : [...scope.querySelectorAll(POST)].some((each) =>
          postId({ post: each }),
        );
    if (stillShowing) return [];
    return [...scope.querySelectorAll(contract.button)].filter((button) => {
      const owner = button.closest(POST);
      return (
        (!owner || owner === post) &&
        visible(button) &&
        enabled(button) &&
        normalize(button.textContent) === contract.undoLabel &&
        !button.closest('[hidden], [inert], [aria-hidden="true"]') &&
        !faded(button)
      );
    });
  }

  const overlayOpen = () =>
    [...document.querySelectorAll(any(contract.overlay.candidates))].some(
      visible,
    );

  const typingContext = ({ event }) =>
    event
      .composedPath()
      .concat(document.activeElement)
      .some(
        (element) =>
          element instanceof Element &&
          (element.isContentEditable || element.closest(contract.typing)),
      );

  // Counts of what wheel recognizes under `root`, for drift detection and the
  // live probe. Counts only: never content, handles, or IDs.
  function health({ root }) {
    const found = posts({ root });
    const count = (test) => found.filter((post) => test({ post })).length;
    const has = (selectors) => (args) => !!own({ ...args, selectors });
    return {
      // Any article at all: the one place a bare `article` is queried.
      articles: root.querySelectorAll("article").length,
      post: found.length,
      withId: count(postId),
      ads: count(isAd),
      like: count(has(contract.like.candidates)),
      liked: count(has(contract.like.liked)),
      caret: count(has(contract.caret.candidates)),
      avatar: count(avatar),
      column: !!column(),
      forYou: onForYou(),
    };
  }

  wheel.x = Object.freeze({
    contract,
    layout,
    timing,
    visible,
    onForYou,
    column,
    posts,
    postId,
    timestamp,
    timestamps,
    timestampId,
    isAd,
    cell,
    avatar,
    isConversationRail,
    likeControl,
    likeState,
    caret,
    menus,
    menuAt,
    feedbackItem,
    menuDiagnostics,
    closeMenu,
    undoControls,
    overlayOpen,
    typingContext,
    health,
  });
})();
