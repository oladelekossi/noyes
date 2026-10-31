// Development-only flight recorder, loaded in noyes's isolated world before
// main installs its input listeners. No text, URLs, raw IDs, or network data.
(() => {
  "use strict";
  const noyes = globalThis.__noyes;
  if (noyes.recorder) return;
  const REPORT = "__NOYES_REPORT_TEMPLATE__";
  const BUILD = "__NOYES_BUILD__";
  const MAX_RECORDS = 18000;
  const MAX_DURATION = 10 * 60 * 1000;
  const MAX_POSTS = 250;
  const MAX_BYTES = 24 * 1024 * 1024;
  const SHORTCUTS = new Set(["j", "k", "l", "n", "u", "Escape"]);
  const ids = new Map();
  const nodes = new WeakMap();
  let nodeCount = 0;
  let active = false;
  let started = 0;
  let startedAt = null;
  let records = [];
  let sequence = 0;
  let timer;
  let lastSignature;
  let host;
  let status;
  let startButton;
  let stopButton;
  let exportButton;
  let markButton;
  let observer;
  let lastError = false;
  let bytes = 0;

  const alias = (key) => {
    if (!key) return null;
    if (!ids.has(key)) ids.set(key, `post-${ids.size + 1}`);
    return ids.get(key);
  };
  const nodeAlias = (node) => {
    if (!nodes.has(node)) nodes.set(node, ++nodeCount);
    return nodes.get(node);
  };
  const time = () => Math.round((performance.now() - started) * 10) / 10;
  const rect = (element) => {
    const r = element.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };

  function snapshot() {
    const x = noyes.x;
    const items = noyes.feed.read();
    const selected = noyes.selection.get();
    const item = items.find((entry) => entry.key === selected);
    const root = x.column();
    const posts = root ? x.posts({ root }) : [];
    const forYou = x.onForYou();
    const inViewport = !!item && noyes.feed.inViewport({ item });
    const painted = !!item?.articles.every((post) =>
      post.classList.contains("noyes-selected"),
    );
    const appearance = !!item?.articles.every((post) => {
      const style = getComputedStyle(post);
      return (
        (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
        style.boxShadow !== "none"
      );
    });
    let diagnosis = "visible-selection";
    if (!forYou) diagnosis = "outside-supported-feed";
    else if (!selected) diagnosis = "no-selection";
    else if (!item) diagnosis = "selected-item-missing-from-feed";
    else if (!inViewport) diagnosis = "selected-item-offscreen";
    else if (!painted) diagnosis = "selection-class-missing";
    else if (!appearance) diagnosis = "outline-style-missing";
    const state = {
      selected: alias(selected),
      diagnosis,
      forYou,
      overlay: x.overlayOpen(),
      typing: x.typingContext({ event: { composedPath: () => [] } }),
      focused: document.hasFocus(),
      hidden: document.hidden,
      pendingFeedback: !!noyes.feedback.pending(),
      feedbackState: noyes.feedback.state(),
      feedbackOutcome: noyes.feedback.outcome(),
      menus: x
        .menus({ root: document })
        .filter(x.visible)
        .map((menu) => x.menuDiagnostics({ menu })),
      aligning: document.documentElement.classList.contains("noyes-aligning"),
      scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
      viewport: { width: innerWidth, height: innerHeight },
      headerHeight: x.layout.headerHeight,
      itemCount: items.length,
      postCount: posts.length,
      truncated: posts.length > MAX_POSTS,
      health: root ? x.health({ root }) : null,
      items: items.slice(0, MAX_POSTS).map((entry) => ({
        id: alias(entry.key),
        nodes: entry.articles.map(nodeAlias),
      })),
      posts: posts.slice(0, MAX_POSTS).map((post) => {
        const key = x.postId({ post });
        const style = getComputedStyle(post);
        return {
          id: alias(key),
          node: nodeAlias(post),
          rect: rect(post),
          selected: post.classList.contains("noyes-selected"),
          thread: post.classList.contains("noyes-thread"),
          visible: x.visible(post),
          suppressed: noyes.feed.isSuppressed({ post, key }),
          outline: {
            style: style.outlineStyle,
            width: style.outlineWidth,
            color: style.outlineColor,
            shadow: style.boxShadow,
          },
        };
      }),
    };
    return state;
  }

  // Avoid copying native exceptions: they may contain page text or URLs.
  function capture({ type, detail = {}, force = true }) {
    if (!active) return;
    try {
      const state = snapshot();
      const signature = JSON.stringify(state);
      if (!force && signature === lastSignature) return;
      lastSignature = signature;
      if (bytes + signature.length * 2 > MAX_BYTES) {
        stop("size-limit");
        return;
      }
      bytes += signature.length * 2;
      records.push({ seq: ++sequence, t: time(), type, detail, state });
      if (records.length >= MAX_RECORDS) stop("record-limit");
    } catch {
      records.push({
        seq: ++sequence,
        t: time(),
        type: "recorder-error",
        detail: { reason: "state-read-failed" },
      });
      lastError = true;
      stop("state-read-failed");
    }
  }

  function stop(reason = "manual") {
    if (!active) return;
    active = false;
    clearInterval(timer);
    observer?.disconnect();
    records.push({
      seq: ++sequence,
      t: time(),
      type: "stop",
      detail: { reason },
    });
    startButton.disabled = true;
    stopButton.disabled = true;
    markButton.disabled = true;
    exportButton.disabled = false;
    status.textContent = lastError
      ? "State read failed; export partial recording"
      : `Stopped · ${records.length} events · export to keep`;
  }

  function start() {
    if (active || records.length) return;
    ids.clear();
    sequence = 0;
    bytes = 0;
    started = performance.now();
    startedAt = new Date().toISOString();
    active = true;
    lastError = false;
    lastSignature = null;
    startButton.disabled = true;
    stopButton.disabled = false;
    markButton.disabled = false;
    exportButton.disabled = true;
    capture({ type: "start" });
    observer = new MutationObserver((changes) => {
      const relevant = changes.filter(
        (change) => change.target !== host && !host.contains(change.target),
      );
      if (!relevant.length) return;
      capture({
        type: "dom-batch",
        detail: {
          childList: relevant.filter((c) => c.type === "childList").length,
          added: relevant.flatMap((c) => [...c.addedNodes]).length,
          removed: relevant.flatMap((c) => [...c.removedNodes]).length,
          attributes: relevant.filter((c) => c.type === "attributes").length,
          textChanges: relevant.filter((c) => c.type === "characterData")
            .length,
        },
      });
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "href", "aria-selected"],
      characterData: true,
    });
    timer = setInterval(() => {
      capture({ type: "sample", force: false });
      status.textContent = `Recording · ${Math.floor(time() / 1000)}s · ${records.length} events`;
      if (time() >= MAX_DURATION) stop("time-limit");
    }, 200);
    status.textContent = "Recording";
  }

  function data() {
    return {
      format: "noyes-flight-recorder-v1",
      build: BUILD,
      version: globalThis.chrome?.runtime?.getManifest?.().version || "fixture",
      startedAt,
      duration: records.at(-1)?.t || 0,
      interval: 200,
      limits: {
        records: MAX_RECORDS,
        duration: MAX_DURATION,
        posts: MAX_POSTS,
        stateBytes: MAX_BYTES,
      },
      records,
    };
  }

  function download() {
    if (!records.length || active) return;
    const json = JSON.stringify(data()).replaceAll("<", "\\u003c");
    const html = REPORT.replace("__NOYES_DATA__", () => json);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `noyes-debug-${startedAt.replaceAll(/[:.]/g, "-")}.html`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    // Keep the previous recording until it has actually been exported.
    startButton.disabled = false;
    startButton.textContent = "New recording";
    startButton.onclick = () => {
      if (!confirm("Discard this recording and start a new one?")) return;
      records = [];
      start();
    };
  }

  // The functions themselves are frozen in production. Replace only the
  // debug build's namespace entries, preserving receiver, result and errors.
  function instrument({ module, methods }) {
    const original = noyes[module];
    const wrapped = { ...original };
    for (const name of methods) {
      const method = original[name];
      wrapped[name] = function (...args) {
        if (!active) return Reflect.apply(method, original, args);
        const argument = args[0];
        const detail = {
          module,
          method: name,
          target: alias(argument?.key || argument?.item?.key),
        };
        if (typeof argument?.direction === "number")
          detail.direction = argument.direction;
        if (typeof argument?.scroll === "boolean")
          detail.scroll = argument.scroll;
        capture({ type: "call-before", detail });
        try {
          const result = Reflect.apply(method, original, args);
          capture({ type: "call-after", detail });
          // Do not attach promise handlers: that could change rejection behavior.
          return result;
        } catch (error) {
          capture({ type: "call-threw", detail });
          throw error;
        }
      };
    }
    noyes[module] = Object.freeze(wrapped);
  }

  for (const options of [
    {
      module: "selection",
      methods: ["select", "clear", "navigate", "interrupt"],
    },
    {
      module: "feedback",
      methods: ["like", "dismiss", "undo", "restorePrevious", "interrupt"],
    },
    { module: "feed", methods: ["suppress", "release"] },
  ])
    instrument(options);

  for (const type of ["keydown", "keyup"])
    addEventListener(
      type,
      (event) => {
        if (event.composedPath().includes(host) && !SHORTCUTS.has(event.key)) {
          event.stopImmediatePropagation();
          return;
        }
        if (!active || noyes.x.typingContext({ event })) return;
        const detail = {
          key: SHORTCUTS.has(event.key) ? event.key : "other",
          repeat: event.repeat,
          composing: event.isComposing || event.keyCode === 229,
          modifiers: {
            ctrl: event.ctrlKey,
            meta: event.metaKey,
            alt: event.altKey,
            shift: event.shiftKey,
          },
        };
        capture({ type: `${type}-before`, detail });
        // A microtask can run between native event listeners. Use a task so
        // noyes's later capture listener has already had a chance to consume it.
        setTimeout(
          () =>
            capture({
              type: `${type}-after`,
              detail: { ...detail, prevented: event.defaultPrevented },
            }),
          0,
        );
      },
      true,
    );
  for (const type of ["wheel", "pointerdown", "touchstart"])
    addEventListener(
      type,
      (event) => {
        if (event.composedPath().includes(host)) {
          event.stopImmediatePropagation();
          return;
        }
        capture({
          type,
          detail:
            type === "wheel"
              ? { dx: event.deltaX, dy: event.deltaY, mode: event.deltaMode }
              : {},
        });
      },
      { capture: true, passive: true },
    );
  for (const type of ["scroll", "resize", "focus", "blur", "visibilitychange"])
    addEventListener(type, () => capture({ type, force: false }), true);
  for (const type of ["error", "unhandledrejection"])
    addEventListener(type, () => capture({ type, detail: { count: 1 } }), true);

  function mount() {
    host = document.createElement("div");
    host.id = "noyes-debug-recorder";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host { all: initial; position: fixed; right: 16px; bottom: 16px;
        z-index: 2147483647; color-scheme: dark; }
      section { background: #171b22; color: #edf2f7; border: 1px solid #596273;
        border-radius: 12px; padding: 12px; font: 13px/1.5 system-ui;
        box-shadow: 0 4px 24px #0006; max-width: 360px; }
      p { margin: 0 0 8px } button { font: inherit; cursor: pointer;
        background: #293342; color: inherit; border: 1px solid #758095;
        border-radius: 6px; padding: 5px 9px; margin: 2px; }
      button:disabled { opacity: .45; cursor: default; }
      small { display: block; color: #b8c3d4; margin-top: 7px; }
    </style><section aria-label="noyes debug recorder">
      <p><strong>noyes flight recorder</strong> · <span role="status">Idle</span></p>
      <button id="start">Record</button><button id="mark" disabled>Bug here</button>
      <button id="stop" disabled>Stop</button><button id="export" disabled>Export replay</button>
      <small>Local · no post content · stops after 10 min. Export before refreshing.</small>
    </section>`;
    status = shadow.querySelector("[role=status]");
    startButton = shadow.querySelector("#start");
    markButton = shadow.querySelector("#mark");
    stopButton = shadow.querySelector("#stop");
    exportButton = shadow.querySelector("#export");
    startButton.onclick = start;
    stopButton.onclick = () => stop();
    exportButton.onclick = download;
    markButton.onclick = () => capture({ type: "bug-marker" });
    document.documentElement.append(host);
  }
  addEventListener("beforeunload", (event) => {
    if (!active && !records.length) return;
    event.preventDefault();
    event.returnValue = "";
  });
  noyes.recorder = Object.freeze({ data });
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
