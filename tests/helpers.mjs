import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fixture } from "./fixture.mjs";

// The manifest is the single source of load order, for Chrome and for tests.
const manifest = JSON.parse(readFileSync(resolve("extension/manifest.json")));
const [scripts] = manifest.content_scripts;

// Injects the extension's CSS and scripts into the page, in manifest order.
export async function inject({ page }) {
  for (const file of scripts.css)
    await page.addStyleTag({ path: resolve("extension", file) });
  for (const file of scripts.js)
    await page.addScriptTag({ path: resolve("extension", file) });
}

// Serves the synthetic feed at x.com/home, optionally with wheel injected.
export async function openFeed({ page, injected = true }) {
  await page.route("https://x.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: fixture }),
  );
  await page.goto("https://x.com/home");
  if (injected) await inject({ page });
}

// Wraps each post in its own virtualized feed cell, as X does.
export function wrapInFeedCells(posts) {
  for (const post of posts) {
    const cell = document.createElement("div");
    cell.dataset.testid = "cellInnerDiv";
    post.before(cell);
    cell.append(post);
  }
}

// Makes the fixture's Undo restore the same article instead of a new one.
export function restoreSameArticleOnUndo(post) {
  const children = [...post.childNodes];
  document.addEventListener(
    "click",
    (event) => {
      if (!event.target.matches(".undo")) return;
      event.stopImmediatePropagation();
      window.feedback = [];
      post.replaceChildren(...children);
    },
    true,
  );
}
