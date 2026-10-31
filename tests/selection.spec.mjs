import { test, expect } from "@playwright/test";
import { openFeed } from "./helpers.mjs";

const tallFeed =
  "body { padding-bottom: 1200px; } main { overflow: visible; } .tabs { position: sticky; top: 0; height: 88px; background: white; z-index: 1; } article { min-height: 300px; } article:nth-child(2) { min-height: 1100px; }";

const top = async (locator) => Math.round((await locator.boundingBox()).y);

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
  const selected = page.locator(".noyes-selected");
  await expect.poll(() => top(selected)).toBe(100);
  return selected;
}

test.beforeEach(async ({ page }) => openFeed({ page }));

test("green outline surrounds the whole post in light and dark layouts without extra controls", async ({
  page,
}) => {
  const testInfo = test.info();
  await page.keyboard.press("k");
  const selected = page.locator("article.noyes-selected");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.evaluate(() => document.body.classList.add("dark"));
    await expect(selected).toHaveCSS("outline", "rgb(34, 197, 94) solid 2px");
    await expect(selected).toHaveCSS("outline-offset", "-2px");
    await page.screenshot({ path: testInfo.outputPath(`noyes-${theme}.png`) });
  }
});

test("k selects the first visible post then advances; j moves back without wrapping", async ({
  page,
}) => {
  const selected = page.locator(".noyes-selected a:has(time)");
  await page.keyboard.press("k");
  await expect(selected).toHaveAttribute("href", "/alex/status/101");
  await page.keyboard.press("k");
  await expect(selected).toHaveAttribute("href", "/jordan/status/102");
  await page.keyboard.press("j");
  await expect(selected).toHaveAttribute("href", "/alex/status/101");
  await page.keyboard.press("j");
  await expect(selected).toHaveAttribute("href", "/alex/status/101");
});

test("keyboard selection follows new posts and resets after recycling", async ({
  page,
}) => {
  for (let i = 0; i < 3; i++) await page.keyboard.press("k");
  await page.evaluate(() => window.addPost({ id: "104" }));
  await page.keyboard.press("k");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/104",
  );
  await page.evaluate(
    () =>
      (document.querySelector(".noyes-selected time").closest("a").href =
        "/alex/status/999"),
  );
  await expect(page.locator(".noyes-selected")).toHaveCount(0);
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
  await expect(page.locator(".noyes-selected")).toHaveCSS(
    "outline",
    "rgb(34, 197, 94) solid 2px",
  );
  await page.screenshot({ path: testInfo.outputPath("noyes-keyboard.png") });
});

test("noyes suppresses the feed focus ring but preserves focus and normal control outlines", async ({
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
  await expect(page.locator("article.noyes-selected")).toHaveCSS(
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
  await expect(page.locator(".noyes-selected")).toHaveCount(0);
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
      (document.querySelector(".noyes-selected").className = "x-rendered-post"),
  );
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  await page.evaluate(() => {
    const post = document.querySelector(".noyes-selected");
    const replacement = post.cloneNode(true);
    replacement.className = "x-rendered-post";
    post.remove();
    setTimeout(
      () => document.querySelectorAll("article")[0].after(replacement),
      80,
    );
  });
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  await page.keyboard.press("k");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
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
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
});

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
  const selected = page.locator(".noyes-selected");
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
  await expect(page.locator(".noyes-selected")).toHaveCount(1);
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
  await expect.poll(() => top(page.locator(".noyes-selected"))).toBe(100);
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
  await expect.poll(() => top(page.locator(".noyes-selected"))).toBe(100);
  await page.keyboard.press("k");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await expect.poll(() => top(page.locator(".noyes-selected"))).toBe(100);
});

// Selects the second post below the header and counts noyes's scroll commands.
test("navigation corrects a feed shift before exposing the displaced post", async ({
  page,
}) => {
  const selected = await navigateToSecondPost(page);
  // X positions feed cells with transforms. Re-measuring a post above moves the
  // selected post after noyes's scroll, and browser scroll anchoring ignores it.
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
          document.querySelector(".noyes-selected").getBoundingClientRect().top,
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
          document.querySelector(".noyes-selected").getBoundingClientRect().top,
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
  await expect(page.locator("html")).not.toHaveClass(/noyes-aligning/);
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
  await expect(page.locator("html")).not.toHaveClass(/noyes-aligning/);
});

test("navigation yields to manual scrolling and stops watching once the feed settles", async ({
  page,
}) => {
  const selected = await navigateToSecondPost(page);
  await page.keyboard.press("k");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
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
    document.querySelector(".noyes-selected").className = "x-rendered-post";
  });
  await expect(selected).toHaveCount(1);
  await page.waitForTimeout(600);
  expect(await top(selected)).toBe(36);
  expect(await page.evaluate(() => window.scrolls)).toBe(4);
});

test("layout: the header height reaches CSS from the adapter", async ({
  page,
}) => {
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--noyes-header-height",
      ),
    ),
  ).toBe("100px");
});
