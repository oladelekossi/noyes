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

test("missing action never triggers mute, block, report, or local dismissal", async ({
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
  await expect(page.getByRole("status")).toContainText("Nothing was changed");
  expect(await page.evaluate(() => window.otherActions)).toEqual([]);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
  await expect(page.locator("article")).toHaveCount(3);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/101",
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

test("navigation shows short and tall posts from the top and settles layout shifts", async ({
  page,
}) => {
  await page.addStyleTag({
    content:
      "body { padding-bottom: 1200px; } main { overflow: visible; } .tabs { position: sticky; top: 0; height: 88px; background: white; z-index: 1; } article { min-height: 300px; } article:nth-child(2) { min-height: 1100px; }",
  });
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  const selected = page.locator(".wheel-selected");
  await expect
    .poll(async () => Math.round((await selected.boundingBox()).y))
    .toBe(100);
  await page.evaluate(
    () => (document.querySelector("article").style.minHeight = "700px"),
  );
  await expect
    .poll(async () => Math.round((await selected.boundingBox()).y))
    .toBe(100);
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await expect
    .poll(async () => Math.round((await selected.boundingBox()).y))
    .toBe(100);
  await page.mouse.wheel(0, 250);
  await expect
    .poll(async () => Math.round((await selected.boundingBox()).y))
    .toBeLessThan(0);
  await page.waitForTimeout(850);
  expect(Math.round((await selected.boundingBox()).y)).toBeLessThan(0);
  await expect(selected).toHaveCSS("outline-color", "rgb(34, 197, 94)");
});
