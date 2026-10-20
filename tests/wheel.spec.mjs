import { test, expect } from "@playwright/test";
import { fixture } from "./fixture.mjs";
import { resolve } from "node:path";
const script = resolve("extension/content.js");
const css = resolve("extension/content.css");

async function start(page) {
  await page.route("https://x.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: fixture }),
  );
  await page.goto("https://x.com/home");
  await page.addStyleTag({ path: css });
  await page.addScriptTag({ path: script });
  await expect(page.locator(".wheel-button")).toHaveCount(0);
}
test.beforeEach(async ({ page }) => start(page));

test("n sends native feedback for exactly the chosen post and keeps Undo", async ({
  page,
}) => {
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["102"]);
  expect(await page.evaluate(() => window.otherActions)).toEqual([]);
  await expect(page.locator(".native-feedback")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.feedback)).toEqual([]);
  await expect(page.locator(".wheel-button")).toHaveCount(0);
});

test("selection clears outside For You and shortcuts leave other pages alone", async ({
  page,
}) => {
  await page.keyboard.press("k");
  await page.getByRole("tab", { name: "Following", exact: true }).click();
  await expect(page.locator(".wheel-selected")).toHaveCount(0);
  await page.keyboard.press("l");
  await page.getByRole("tab", { name: "For you", exact: true }).click();
  for (const path of ["/alex", "/alex/status/101"]) {
    await page.evaluate(() => history.pushState({}, "", "/home"));
    await page.keyboard.press("k");
    await page.evaluate((path) => history.pushState({}, "", path), path);
    await expect(page.locator(".wheel-selected")).toHaveCount(0);
    await page.keyboard.press("l");
  }
  expect(await page.evaluate(() => window.likes)).toEqual([]);
});

test("repeat injection does not duplicate shortcut handlers", async ({
  page,
}) => {
  await page.addScriptTag({ path: script });
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["101"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
});

test("missing feedback skips without mute, block, report, or local dismissal", async ({
  page,
}) => {
  await page.evaluate(
    () =>
      (window.options = [
        "Mute @example",
        "Block @example",
        "Report post",
        "Not interested in this ad",
      ]),
  );
  await page.keyboard.press("n");
  await expect(page.getByRole("status")).toContainText(
    "Skipped — feedback unavailable",
  );
  expect(await page.evaluate(() => window.otherActions)).toEqual([]);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
  await expect(page.locator("article")).toHaveCount(3);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
});

test("handles delayed menus and delayed feedback labels", async ({ page }) => {
  await page.evaluate(() => {
    window.menuDelay = 220;
    window.itemDelay = 220;
  });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
});

test("does not touch an already open native menu", async ({ page }) => {
  await page.locator("[data-testid=caret]").nth(1).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.getByRole("menu")).toBeVisible();
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test("navigation cancels pending feedback", async ({ page }) => {
  await page.evaluate(() => (window.menuDelay = 300));
  await page.keyboard.press("n");
  await page.getByRole("tab", { name: "Following", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  // Wait past the action deadline to ensure no delayed feedback is dispatched.
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test("Escape cancels pending feedback", async ({ page }) => {
  await page.evaluate(() => (window.menuDelay = 250));
  await page.keyboard.press("n");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test("post recycling during the menu wait cancels feedback", async ({
  page,
}) => {
  await page.evaluate(() => (window.menuDelay = 250));
  await page.keyboard.press("n");
  await page.evaluate(
    () =>
      (document.querySelector("time").closest("a").href = "/alex/status/999"),
  );
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test("keyboard activation and the legacy Tweet label work", async ({
  page,
}) => {
  await page.evaluate(
    () => (window.options = ["Not interested in this Tweet", "Block @example"]),
  );
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
});

test("navigation skips ads and nested quoted posts", async ({ page }) => {
  await page.evaluate(() => {
    const ad = window.addPost({ id: "105" });
    const marker = document.createElement("div");
    marker.dataset.testid = "placementTracking";
    ad.append(marker);
    const quote = window.addPost({ id: "106" });
    document.querySelector("article").append(quote);
  });
  for (let i = 0; i < 5; i++) await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await expect(page.locator(".wheel-button")).toHaveCount(0);
});

test("green outline surrounds the whole post in light and dark layouts without extra controls", async ({
  page,
}) => {
  const testInfo = test.info();
  await page.keyboard.press("k");
  const selected = page.locator("article.wheel-selected");
  await expect(page.locator(".wheel-button")).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.evaluate(() => document.body.classList.add("dark"));
    await expect(selected).toHaveCSS("outline", "rgb(34, 197, 94) solid 2px");
    await expect(selected).toHaveCSS("outline-offset", "-2px");
    await page.screenshot({ path: testInfo.outputPath(`wheel-${theme}.png`) });
  }
});

test("k selects the first visible post then advances; j moves back without wrapping", async ({
  page,
}) => {
  const selected = page.locator(".wheel-selected a:has(time)");
  await page.keyboard.press("k");
  await expect(selected).toHaveAttribute("href", "/alex/status/101");
  await page.keyboard.press("k");
  await expect(selected).toHaveAttribute("href", "/jordan/status/102");
  await page.keyboard.press("j");
  await expect(selected).toHaveAttribute("href", "/alex/status/101");
  await page.keyboard.press("j");
  await expect(selected).toHaveAttribute("href", "/alex/status/101");
});

test("l likes and advances immediately, including past an already-liked post", async ({
  page,
}) => {
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await page.keyboard.press("l");
  await expect.poll(() => page.evaluate(() => window.likes)).toEqual(["102"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await page.keyboard.press("j");
  await page.keyboard.press("l");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  expect(await page.evaluate(() => window.likes)).toEqual(["102"]);
});

test("n sends feedback on the selected post and advances selection", async ({
  page,
}) => {
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["102"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await page.keyboard.press("l");
  await expect.poll(() => page.evaluate(() => window.likes)).toEqual(["103"]);
});

test("l then n advances through successive posts without navigation keys", async ({
  page,
}) => {
  await page.keyboard.press("l");
  await expect.poll(() => page.evaluate(() => window.likes)).toEqual(["101"]);
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["102"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
});

test("holding l likes and advances only once; the last post never wraps", async ({
  page,
}) => {
  await page.keyboard.down("l");
  await page.keyboard.down("l");
  await page.keyboard.up("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["101"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  await page.keyboard.press("k");
  await page.keyboard.press("l");
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["101", "103"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
});

test("typing, composition, and modifier shortcuts do not trigger wheel", async ({
  page,
}) => {
  await page.evaluate(() => {
    const controls = document.createElement("div");
    controls.innerHTML =
      '<input aria-label="Search"><textarea aria-label="Draft"></textarea><div contenteditable="true" role="textbox" aria-label="Composer"></div><div role="combobox" tabindex="0" aria-label="Search suggestions"></div>';
    document.body.append(controls);
  });
  for (const name of ["Search", "Draft", "Composer", "Search suggestions"]) {
    await page.getByLabel(name, { exact: true }).focus();
    await page.keyboard.type("jkln");
  }
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue("jkln");
  await expect(page.getByLabel("Draft")).toHaveValue("jkln");
  await expect(page.getByLabel("Composer")).toHaveText("jkln");
  await page.evaluate(() => document.activeElement.blur());
  for (const shortcut of ["Control+l", "Alt+n", "Meta+k", "Shift+j"])
    await page.keyboard.press(shortcut);
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "n",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  expect(await page.evaluate(() => window.likes)).toEqual([]);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
  await expect(page.locator(".wheel-selected")).toHaveCount(0);
});

test("shortcuts respect dialogs and other feed tabs", async ({ page }) => {
  await page.evaluate(() => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.textContent = "Compose";
    document.body.append(dialog);
  });
  for (const key of ["k", "l", "n"]) await page.keyboard.press(key);
  await expect(page.locator(".wheel-selected")).toHaveCount(0);
  await page.evaluate(() => document.querySelector("[role=dialog]").remove());
  await page.getByRole("tab", { name: "Following", exact: true }).click();
  for (const key of ["k", "l", "n"]) await page.keyboard.press(key);
  expect(await page.evaluate(() => window.likes)).toEqual([]);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test("holding n sends feedback only once", async ({ page }) => {
  await page.keyboard.down("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.keyboard.down("n");
  await page.keyboard.up("n");
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
});

test("keyboard selection follows new posts and resets after recycling", async ({
  page,
}) => {
  for (let i = 0; i < 3; i++) await page.keyboard.press("k");
  await page.evaluate(() => window.addPost({ id: "104" }));
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/104",
  );
  await page.evaluate(
    () =>
      (document.querySelector(".wheel-selected time").closest("a").href =
        "/alex/status/999"),
  );
  await expect(page.locator(".wheel-selected")).toHaveCount(0);
});

test("scrolling past a selection makes l target the visible post", async ({
  page,
}) => {
  await page.evaluate(() => {
    document
      .querySelectorAll("article")
      .forEach((post) => (post.style.minHeight = "700px"));
  });
  await page.keyboard.press("k");
  await page.mouse.wheel(0, 1400);
  await expect
    .poll(async () => (await page.locator("article").nth(2).boundingBox()).y)
    .toBeLessThan(300);
  await page.keyboard.press("l");
  await expect.poll(() => page.evaluate(() => window.likes)).toEqual(["103"]);
});

test("selected post has a visible marker", async ({ page }) => {
  const testInfo = test.info();
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected")).toHaveCSS(
    "outline",
    "rgb(34, 197, 94) solid 2px",
  );
  await page.screenshot({ path: testInfo.outputPath("wheel-keyboard.png") });
});

test("wheel suppresses the feed focus ring but preserves focus and normal control outlines", async ({
  page,
}) => {
  const feed = page.locator("[data-testid=primaryColumn]");
  await page.addStyleTag({
    content: ":focus-visible { outline: 3px solid blue; }",
  });
  await feed.evaluate((element) => element.setAttribute("tabindex", "0"));
  await feed.focus();
  await expect(feed).toHaveCSS("outline-color", "rgb(0, 0, 255)");
  await page.keyboard.press("k");
  await expect(feed).toBeFocused();
  await expect(feed).toHaveCSS("outline-style", "none");
  await expect(page.locator("article.wheel-selected")).toHaveCSS(
    "outline",
    "rgb(34, 197, 94) solid 2px",
  );
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("tab", { name: "For you", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "For you", exact: true }),
  ).toHaveCSS("outline-color", "rgb(0, 0, 255)");
  await page.getByRole("tab", { name: "Following", exact: true }).click();
  await expect(page.locator(".wheel-selected")).toHaveCount(0);
  await feed.focus();
  await page.keyboard.press("ArrowDown");
  await expect(feed).toHaveCSS("outline-style", "solid");
});

test("selection survives class rewrites and replacement of the same tweet", async ({
  page,
}) => {
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await page.evaluate(
    () =>
      (document.querySelector(".wheel-selected").className = "x-rendered-post"),
  );
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  await page.evaluate(() => {
    const post = document.querySelector(".wheel-selected");
    const replacement = post.cloneNode(true);
    replacement.className = "x-rendered-post";
    post.remove();
    setTimeout(
      () => document.querySelectorAll("article")[0].after(replacement),
      80,
    );
  });
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
});

test("liking advances by tweet ID even if X replaces the next article", async ({
  page,
}) => {
  await page.evaluate(() => {
    document
      .querySelector('[data-testid="like"]')
      .addEventListener("click", () => {
        const next = document.querySelectorAll("article")[1];
        const replacement = next.cloneNode(true);
        next.replaceWith(replacement);
      });
  });
  await page.keyboard.press("l");
  await expect.poll(() => page.evaluate(() => window.likes)).toEqual(["101"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
});

const tallFeed =
  "body { padding-bottom: 1200px; } main { overflow: visible; } .tabs { position: sticky; top: 0; height: 88px; background: white; z-index: 1; } article { min-height: 300px; } article:nth-child(2) { min-height: 1100px; }";
const top = async (locator) => Math.round((await locator.boundingBox()).y);

test("like advancement waits for a temporarily unmounted next post and aligns its header", async ({
  page,
}) => {
  await page.addStyleTag({ content: tallFeed });
  await page.evaluate(() => {
    document
      .querySelector('[data-testid="like"]')
      .addEventListener("click", () => {
        const next = document.querySelectorAll("article")[1];
        const previous = next.previousElementSibling;
        next.remove();
        setTimeout(() => previous.after(next), 80);
      });
  });
  await page.keyboard.press("l");
  await expect.poll(() => page.evaluate(() => window.likes)).toEqual(["101"]);
  const selected = page.locator(".wheel-selected");
  await expect(selected.locator("a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  await expect.poll(() => top(selected)).toBe(100);
  await page.keyboard.press("k");
  await expect(selected.locator("a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await expect.poll(() => top(selected)).toBe(100);
});

test("manual input cancels navigation waiting for a post to remount", async ({
  page,
}) => {
  await page.addStyleTag({ content: tallFeed });
  await page.evaluate(() => {
    window.scrolls = 0;
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      window.scrolls += 1;
      original.call(this, options);
    };
    document
      .querySelector('[data-testid="like"]')
      .addEventListener("click", () => {
        const next = document.querySelectorAll("article")[1];
        const previous = next.previousElementSibling;
        next.remove();
        window.restoreNext = () => previous.after(next);
      });
  });
  await page.keyboard.press("l");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.restoreNext());
  await expect(page.locator(".wheel-selected")).toHaveCount(1);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.scrolls)).toBe(0);
});

test("holding like does not cancel alignment after a delayed feed shift", async ({
  page,
}) => {
  await page.addStyleTag({ content: tallFeed });
  await page.keyboard.down("l");
  await page.keyboard.down("l");
  await page.evaluate(() => {
    document.querySelector("#feed").style.transform = "translateY(-180px)";
  });
  await page.keyboard.up("l");
  await expect.poll(() => top(page.locator(".wheel-selected"))).toBe(100);
  expect(await page.evaluate(() => window.likes)).toEqual(["101"]);
});

test("dismissal keeps the next header aligned after delayed collapse and focus restoration", async ({
  page,
}) => {
  await page.addStyleTag({ content: tallFeed });
  await page.evaluate(() => {
    document.addEventListener(
      "click",
      (event) => {
        if (event.target.getAttribute("role") !== "menuitem") return;
        const previous = document.querySelector("article");
        setTimeout(() => {
          previous.style.minHeight = "0";
          previous.setAttribute("tabindex", "-1");
          previous.focus();
          document.querySelector("#feed").style.transform =
            "translateY(-180px)";
        }, 80);
      },
      true,
    );
  });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.waitForTimeout(350);
  await expect.poll(() => top(page.locator(".wheel-selected"))).toBe(100);
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await expect.poll(() => top(page.locator(".wheel-selected"))).toBe(100);
});

// Selects the second post below the header and counts wheel's scroll commands.
async function navigateToSecondPost(page) {
  await page.addStyleTag({ content: tallFeed });
  await page.evaluate(() => {
    window.scrolls = 0;
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      window.scrolls += 1;
      scrollIntoView.call(this, options);
    };
  });
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  const selected = page.locator(".wheel-selected");
  await expect.poll(() => top(selected)).toBe(100);
  return selected;
}

test("navigation corrects a feed shift before exposing the displaced post", async ({
  page,
}) => {
  const selected = await navigateToSecondPost(page);
  // X positions feed cells with transforms. Re-measuring a post above moves the
  // selected post after wheel's scroll, and browser scroll anchoring ignores it.
  await page.evaluate(() => {
    document.querySelector("#feed").style.transform = "translateY(-180px)";
  });
  expect(await top(selected)).toBe(100);
  await page.waitForTimeout(500);
  expect(await top(selected)).toBe(100);
  // Native snapping can absorb the shift without another scripted scroll.
  expect(await page.evaluate(() => window.scrolls)).toBeLessThanOrEqual(3);
});

test("navigation stays aligned across X's delayed scroll compensation", async ({
  page,
}) => {
  const selected = await navigateToSecondPost(page);
  // X moves its cells, then restores its own scroll anchor a frame later.
  const frames = await page.evaluate(async () => {
    const tops = [];
    document.querySelector("#feed").style.transform = "translateY(64px)";
    requestAnimationFrame(() => window.scrollBy(0, 64));
    for (let frame = 0; frame < 12; frame += 1) {
      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      );
      tops.push(
        Math.round(
          document.querySelector(".wheel-selected").getBoundingClientRect().top,
        ),
      );
    }
    return tops;
  });
  expect(frames).toEqual(Array(12).fill(100));
  expect(await top(selected)).toBe(100);
  expect(await page.evaluate(() => window.scrolls)).toBeLessThanOrEqual(4);
});

test("a post-navigation viewport jump never stays displaced across rendered frames", async ({
  page,
}) => {
  // Live X articles clip their contents with overflow:hidden. The header snap
  // target must belong to the page, not that otherwise unscrollable article.
  await page.addStyleTag({ content: "article { overflow: hidden; }" });
  await navigateToSecondPost(page);
  const frames = await page.evaluate(async () => {
    const tops = [];
    // Matches the recording: correct landing, a viewport jump, then correction.
    // Sampling after each rendering opportunity catches the old 120 ms delay.
    requestAnimationFrame(() => window.scrollBy(0, 450));
    for (let frame = 0; frame < 12; frame += 1) {
      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      );
      tops.push(
        Math.round(
          document.querySelector(".wheel-selected").getBoundingClientRect().top,
        ),
      );
    }
    return tops;
  });
  expect(frames).toEqual(Array(12).fill(100));
  await expect(page.locator("html")).toHaveCSS("overflow-anchor", "none");
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveCSS("overflow-anchor", "auto");
});

test("navigation stops correcting a feed that keeps moving the post", async ({
  page,
}) => {
  await navigateToSecondPost(page);
  await page.evaluate(() => {
    let offset = 0;
    const shift = () => {
      offset -= 50;
      document.querySelector("#feed").style.transform =
        `translateY(${offset}px)`;
    };
    addEventListener("scroll", () => requestAnimationFrame(shift));
    shift();
  });
  await expect(page.locator("html")).not.toHaveClass(/wheel-aligning/);
  const scrolls = await page.evaluate(() => window.scrolls);
  expect(scrolls).toBeLessThanOrEqual(5);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.scrolls)).toBe(scrolls);
});

test("releasing navigation preserves scrolling inside a nested control", async ({
  page,
}) => {
  await navigateToSecondPost(page);
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "nested-scroll";
    box.style.cssText =
      "position:fixed;left:10px;top:120px;width:150px;height:150px;overflow:auto;z-index:100;background:white";
    box.innerHTML = '<div style="height:1000px">Scrollable control</div>';
    document.body.append(box);
  });
  const before = await page.evaluate(() => scrollY);
  await page.mouse.move(50, 180);
  await page.mouse.wheel(0, 200);
  await expect
    .poll(() => page.locator("#nested-scroll").evaluate((e) => e.scrollTop))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await expect(page.locator("html")).not.toHaveClass(/wheel-aligning/);
});

test("navigation yields to manual scrolling and stops watching once the feed settles", async ({
  page,
}) => {
  const selected = await navigateToSecondPost(page);
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await expect.poll(() => top(selected)).toBe(100);
  await page.mouse.wheel(0, 250);
  await expect.poll(() => top(selected)).toBeLessThan(0);
  await page.waitForTimeout(850);
  expect(await top(selected)).toBeLessThan(0);
  await expect(selected).toHaveCSS("outline-color", "rgb(34, 197, 94)");

  await page.keyboard.press("j");
  await expect.poll(() => top(selected)).toBe(100);
  await page.waitForTimeout(1700);
  // Later page updates belong to X: restoring the marker never scrolls.
  await page.evaluate(() => {
    window.scrollBy(0, 64);
    document.querySelector(".wheel-selected").className = "x-rendered-post";
  });
  await expect(selected).toHaveCount(1);
  await page.waitForTimeout(600);
  expect(await top(selected)).toBe(36);
  expect(await page.evaluate(() => window.scrolls)).toBe(4);
});

async function threadFixture(page) {
  await page.evaluate(() => {
    document.querySelector("#feed").replaceChildren();
    const parent = window.addPost({
      id: "201",
      name: "Context",
      options: ["Mute @context"],
    });
    const reply = window.addPost({ id: "202", name: "Reply" });
    const group = document.createElement("div");
    group.dataset.testid = "cellInnerDiv";
    parent.before(group);
    group.append(parent, reply);
    window.addPost({ id: "203", name: "Next" });
  });
}

test("conversation is one selection and j/k skip its context posts", async ({
  page,
}) => {
  await threadFixture(page);
  await page.keyboard.press("k");
  await expect(page.locator("article.wheel-selected")).toHaveCount(2);
  await expect(page.locator(".wheel-thread-start a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/201",
  );
  await expect(page.locator(".wheel-thread-end a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/202",
  );
  await expect(page.locator(".wheel-thread-start")).toHaveCSS(
    "outline-style",
    "none",
  );
  await expect(page.locator(".wheel-thread-start")).toHaveCSS(
    "box-shadow",
    /34, 197, 94/,
  );
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/203",
  );
  await page.keyboard.press("j");
  await expect(page.locator("article.wheel-selected")).toHaveCount(2);
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["202"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/203",
  );
});

test("conversation feedback targets the reply, never the context author", async ({
  page,
}) => {
  await threadFixture(page);
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["202"]);
  expect(await page.evaluate(() => window.openedMenus)).toEqual(["202"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/203",
  );
  expect(await page.evaluate(() => window.otherActions)).toEqual([]);
});

test("conversation without feedback skips once and closes its native menu", async ({
  page,
}) => {
  await threadFixture(page);
  await page.evaluate(() => (window.options = ["Mute @reply", "Block @reply"]));
  await page.keyboard.press("n");
  await expect(page.getByRole("status")).toHaveText(
    "Skipped — feedback unavailable.",
  );
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
  expect(await page.evaluate(() => window.openedMenus)).toEqual(["202"]);
  expect(await page.evaluate(() => window.otherActions)).toEqual([]);
  await expect(page.locator("article")).toHaveCount(3);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/203",
  );
  await page.keyboard.press("j");
  await expect(page.locator("article.wheel-selected")).toHaveCount(2);
});

test("avatar rails join adjacent cells but unrelated mentions stay separate", async ({
  page,
}) => {
  await page.evaluate(() => {
    const posts = [...document.querySelectorAll("article")];
    for (const post of posts) {
      const cell = document.createElement("div");
      cell.dataset.testid = "cellInnerDiv";
      post.before(cell);
      cell.append(post);
      post.style.position = "relative";
    }
    const line = document.createElement("div");
    line.style.cssText =
      "position:absolute;left:41px;top:64px;bottom:0;width:2px;background:gray";
    posts[0].append(line);
    posts[2].querySelector(".post-text").textContent =
      "Replying to @jordan, but a separate feed item";
  });
  await page.keyboard.press("k");
  await expect(page.locator("article.wheel-selected")).toHaveCount(2);
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await page.evaluate(() =>
    document.querySelectorAll("article")[0].lastElementChild.remove(),
  );
  await page.keyboard.press("j");
  await expect(page.locator("article.wheel-selected")).toHaveCount(1);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
});

test("a replaced conversation reply regains the whole green box", async ({
  page,
}) => {
  await threadFixture(page);
  await page.keyboard.press("k");
  await page.evaluate(() => {
    const reply = document.querySelector(".wheel-thread-end");
    const replacement = reply.cloneNode(true);
    replacement.className = "react-replacement";
    reply.replaceWith(replacement);
  });
  await expect(page.locator("article.wheel-selected")).toHaveCount(2);
  await expect(page.locator(".wheel-thread-end a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/202",
  );
});

test("unavailable feedback at the end never jumps backward", async ({
  page,
}) => {
  await page.evaluate(() => (window.options = ["Mute @example"]));
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await page.keyboard.press("n");
  await expect(page.getByRole("status")).toHaveText(
    "Skipped — feedback unavailable.",
  );
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test("regression: navigation cancellation releases the feedback menu", async ({
  page,
}) => {
  await page.evaluate(() => (window.itemDelay = 600));
  await page.keyboard.press("n");
  await page.getByRole("menu").waitFor();
  await page.keyboard.press("k");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test("regression: navigation cancellation closes a late feedback menu", async ({
  page,
}) => {
  await page.evaluate(() => (window.menuDelay = 300));
  await page.keyboard.press("n");
  await page.keyboard.press("k");
  await expect
    .poll(() => page.evaluate(() => window.openedMenus))
    .toEqual(["101"]);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test("regression: Undo restores keyboard access to the same article", async ({
  page,
}) => {
  await page.evaluate(() => {
    const post = document.querySelector("article");
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
  });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.keyboard.press("j");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/101",
  );
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["101"]);
});

test("regression: manual scroll cancels pending feedback and its later jump", async ({
  page,
}) => {
  await page.addStyleTag({
    content:
      "body{padding-bottom:1200px} main{overflow:visible} article{min-height:700px}",
  });
  await page.evaluate(() => (window.itemDelay = 900));
  await page.keyboard.press("n");
  await page.getByRole("menu").waitFor();
  await page.mouse.move(100, 700);
  await page.mouse.wheel(0, 1400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(1400);
  await page.waitForTimeout(1100);
  expect(await page.evaluate(() => scrollY)).toBe(1400);
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["102"]);
});

test("regression: invisible dialogs do not block feedback", async ({
  page,
}) => {
  await page.evaluate(() => {
    const dialog = document.createElement("div");
    dialog.role = "dialog";
    dialog.hidden = true;
    document.body.append(dialog);
  });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
});

for (const hiddenStyle of ["visibility:hidden", "opacity:0"]) {
  test(`regression: avatar rails with ${hiddenStyle} cannot redirect a like`, async ({
    page,
  }) => {
    await page.evaluate((hiddenStyle) => {
      const posts = [...document.querySelectorAll("article")];
      for (const post of posts) {
        const cell = document.createElement("div");
        cell.dataset.testid = "cellInnerDiv";
        post.before(cell);
        cell.append(post);
        post.style.position = "relative";
      }
      const line = document.createElement("div");
      line.style.cssText = `position:absolute;left:41px;top:64px;bottom:0;width:2px;background:gray;${hiddenStyle}`;
      posts[0].append(line);
    }, hiddenStyle);
    await page.keyboard.press("k");
    await expect(page.locator("article.wheel-selected")).toHaveCount(1);
    await page.keyboard.press("l");
    expect(await page.evaluate(() => window.likes)).toEqual(["101"]);
  });
}

test("regression: cancelled discovery preserves a later user menu", async ({
  page,
}) => {
  await page.evaluate(() => (window.menuDelay = 300));
  await page.keyboard.press("n");
  await page.locator('[data-testid="caret"]').nth(1).click();
  await expect
    .poll(() => page.evaluate(() => window.openedMenus))
    .toEqual(["101", "102"]);
  await page.waitForTimeout(400);
  await expect(page.getByRole("menu")).toHaveCount(1);
  await page
    .getByRole("menuitem", { name: "Not interested in this post", exact: true })
    .click();
  expect(await page.evaluate(() => window.feedback)).toEqual(["102"]);
});

test("regression: Undo after the final dismissal restores selection", async ({
  page,
}) => {
  await page.evaluate(() => {
    const posts = [...document.querySelectorAll("article")];
    posts.slice(1).forEach((post) => post.remove());
    const post = posts[0];
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
  });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await expect(page.locator(".wheel-selected")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["101"]);
});

test("regression: native content restored within one mutation batch remains usable", async ({
  page,
}) => {
  await page.evaluate(() => {
    const posts = [...document.querySelectorAll("article")];
    posts.slice(1).forEach((post) => post.remove());
    const post = posts[0];
    const children = [...post.childNodes];
    document.addEventListener(
      "click",
      (event) => {
        if (event.target.getAttribute("role") !== "menuitem") return;
        event.stopImmediatePropagation();
        window.feedback.push("101");
        post.replaceChildren(document.createTextNode("Feedback undone"));
        post.replaceChildren(...children);
        event.target.closest('[role="menu"]').remove();
      },
      true,
    );
  });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["101"]);
});

test("regression: a delayed native result cannot dispatch feedback twice", async ({
  page,
}) => {
  await page.evaluate(() => {
    const posts = [...document.querySelectorAll("article")];
    posts.slice(1).forEach((post) => post.remove());
    document.addEventListener(
      "click",
      (event) => {
        if (event.target.getAttribute("role") !== "menuitem") return;
        event.stopImmediatePropagation();
        window.feedback.push("101");
        event.target.closest('[role="menu"]').remove();
        setTimeout(
          () =>
            posts[0].replaceChildren(
              document.createTextNode("Feedback received"),
            ),
          2200,
        );
      },
      true,
    );
  });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.waitForTimeout(1700);
  await page.evaluate(() => {
    const text = document.querySelector(".post-text");
    text.replaceChildren(
      document.createTextNode("An unrelated live text update"),
    );
  });
  await page.keyboard.press("n");
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
  expect(await page.evaluate(() => window.openedMenus)).toEqual(["101"]);
});

test("regression: timestamp rerenders cannot dispatch feedback twice", async ({
  page,
}) => {
  await page.evaluate(() => {
    const posts = [...document.querySelectorAll("article")];
    posts.slice(1).forEach((post) => post.remove());
    document.addEventListener(
      "click",
      (event) => {
        if (event.target.getAttribute("role") !== "menuitem") return;
        event.stopImmediatePropagation();
        window.feedback.push("101");
        event.target.closest('[role="menu"]').remove();
        setTimeout(() => posts[0].replaceChildren("Feedback received"), 2200);
      },
      true,
    );
  });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.evaluate(() => {
    const time = document.querySelector("article time");
    time.replaceWith(time.cloneNode(true));
  });
  await page.keyboard.press("n");
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
  expect(await page.evaluate(() => window.openedMenus)).toEqual(["101"]);
});

test("regression: clicking a native option takes over the pending menu", async ({
  page,
}) => {
  await page.evaluate(() => (window.options = ["Mute @example"]));
  await page.keyboard.press("n");
  const option = page.getByRole("menuitem", {
    name: "Mute @example",
    exact: true,
  });
  await option.waitFor();
  // Let the feedback operation capture the menu before the user's pointerdown.
  await page.waitForTimeout(100);
  await option.click();
  await expect
    .poll(() => page.evaluate(() => window.otherActions))
    .toEqual(["Mute @example"]);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test("undo shortcut: restores the latest dismissal and selects it", async ({
  page,
}) => {
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.keyboard.press("u");
  await expect.poll(() => page.evaluate(() => window.feedback)).toEqual([]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/101",
  );
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["101"]);
});

test("undo shortcut: only undoes the latest successful n once", async ({
  page,
}) => {
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101", "102"]);
  await page.keyboard.press("u");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/102",
  );
  await page.keyboard.press("u");
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
  await expect(page.locator(".wheel-notice")).toHaveText("Undo unavailable.");
});

for (const layout of ["same article", "replacement in cell"]) {
  test(`undo shortcut: restores ${layout} through native control`, async ({
    page,
  }) => {
    await page.evaluate((layout) => {
      const post = document.querySelector("article");
      const children = [...post.childNodes];
      const cell = document.createElement("div");
      cell.dataset.testid = "cellInnerDiv";
      post.before(cell);
      cell.append(post);
      document.addEventListener(
        "click",
        (event) => {
          if (event.target.getAttribute("role") !== "menuitem") return;
          event.stopImmediatePropagation();
          window.feedback.push("101");
          event.target.closest('[role="menu"]').remove();
          const undo = document.createElement("button");
          undo.textContent = "Undo";
          if (layout === "same article") post.replaceChildren(undo);
          else cell.replaceChildren(undo);
          undo.onclick = () => {
            window.feedback = [];
            undo.remove();
            setTimeout(() => {
              post.replaceChildren(...children);
              cell.append(post);
            }, 120);
          };
        },
        true,
      );
    }, layout);
    await page.keyboard.press("n");
    await expect
      .poll(() => page.evaluate(() => window.feedback))
      .toEqual(["101"]);
    await page.keyboard.press("u");
    await expect.poll(() => page.evaluate(() => window.feedback)).toEqual([]);
    await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
      "href",
      "/alex/status/101",
    );
    await page.keyboard.press("l");
    expect(await page.evaluate(() => window.likes)).toEqual(["101"]);
  });
}

for (const obstruction of [
  "unrelated",
  "quoted",
  "disabled",
  "ambiguous",
  "recycled",
]) {
  test(`undo shortcut: refuses ${obstruction} controls`, async ({ page }) => {
    await page.evaluate(() => {
      const post = document.querySelector("article");
      const cell = document.createElement("div");
      cell.dataset.testid = "cellInnerDiv";
      post.before(cell);
      cell.append(post);
    });
    await page.keyboard.press("n");
    await expect
      .poll(() => page.evaluate(() => window.feedback))
      .toEqual(["101"]);
    await page.evaluate((obstruction) => {
      const undo = document.querySelector(".undo");
      const post = undo.closest("article");
      if (obstruction === "unrelated") document.body.append(undo);
      if (obstruction === "quoted") {
        const quote = document.createElement("article");
        quote.dataset.testid = "tweet";
        post.append(quote);
        quote.append(undo);
      }
      if (obstruction === "disabled") undo.disabled = true;
      if (obstruction === "ambiguous") {
        const duplicate = undo.cloneNode(true);
        duplicate.onclick = () => window.otherActions.push("wrong undo");
        undo.after(duplicate);
      }
      if (obstruction === "recycled") {
        const other = window.addPost({ id: "999" });
        other.append(undo);
        post.replaceWith(other);
      }
    }, obstruction);
    await page.keyboard.press("u");
    await expect(page.locator(".wheel-notice")).toHaveText("Undo unavailable.");
    expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
    expect(await page.evaluate(() => window.otherActions)).toEqual([]);
  });
}

test("undo shortcut: unavailable control can become available later", async ({
  page,
}) => {
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.evaluate(() => (document.querySelector(".undo").hidden = true));
  await page.keyboard.press("u");
  await expect(page.locator(".wheel-notice")).toHaveText("Undo unavailable.");
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
  await page.evaluate(() => (document.querySelector(".undo").hidden = false));
  await page.keyboard.press("u");
  await expect.poll(() => page.evaluate(() => window.feedback)).toEqual([]);
  await expect(page.locator(".wheel-notice")).toHaveCount(0);
});

test("undo shortcut: respects typing, modifiers, dialogs and repeats", async ({
  page,
}) => {
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.evaluate(() => {
    const input = document.createElement("input");
    document.body.prepend(input);
    input.focus();
  });
  await page.keyboard.press("u");
  await expect(page.locator("input")).toHaveValue("u");
  await page.locator("input").evaluate((input) => input.remove());
  for (const chord of ["Control+u", "Meta+u", "Alt+u", "Shift+u"])
    await page.keyboard.press(chord);
  await page.evaluate(() => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.textContent = "An unrelated dialog";
    document.body.append(dialog);
  });
  await page.keyboard.press("u");
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
  await page.getByRole("dialog").evaluate((dialog) => dialog.remove());
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "u", repeat: true, bubbles: true }),
    ),
  );
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
  await page.keyboard.press("u");
  await expect.poll(() => page.evaluate(() => window.feedback)).toEqual([]);
});

test("undo shortcut: cancels pending n without undoing an earlier dismissal", async ({
  page,
}) => {
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.evaluate(() => (window.itemDelay = 500));
  await page.keyboard.press("n");
  await page.getByRole("menu").waitFor();
  await page.keyboard.press("u");
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("u");
  await expect.poll(() => page.evaluate(() => window.feedback)).toEqual([]);
});
