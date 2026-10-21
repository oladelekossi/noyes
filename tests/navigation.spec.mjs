import { chromium, test, expect } from "@playwright/test";
import { fixture } from "./fixture.mjs";
import { resolve } from "node:path";

async function openFeed({ page, inject = true }) {
  await page.route("https://x.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: fixture }),
  );
  await page.goto("https://x.com/home");
  if (inject) {
    await page.addStyleTag({ path: resolve("extension/content.css") });
    await page.addScriptTag({ path: resolve("extension/content.js") });
  }
}

async function enterAdGap(page) {
  await openFeed({ page });
  await page.evaluate(() => {
    const ad = document.createElement("article");
    ad.dataset.testid = "tweet";
    ad.style.height = "1600px";
    ad.innerHTML = '<div data-testid="promotedIndicator">Promoted</div>';
    document.querySelectorAll("article")[1].before(ad);
    window.scrollTo(0, 900);
  });
  await expect(page.locator(".wheel-selected")).toHaveCount(0);
}

test("navigation: k reaches an infinite loader beyond the last tall post", async () => {
  const extension = resolve("extension");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    executablePath:
      process.env.WHEEL_CHROMIUM_EXECUTABLE || chromium.executablePath(),
    viewport: { width: 1080, height: 820 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    const page = await context.newPage();
    // Exercise manifest injection, then navigate only through real keypresses.
    await openFeed({ page, inject: false });
    await page.evaluate(() => {
      document.querySelectorAll("article")[2].style.height = "1800px";
      const loader = document.createElement("div");
      loader.textContent = "Loading more";
      loader.style.height = "30px";
      document.querySelector("#feed").append(loader);
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          window.addPost({ id: "104" });
          loader.remove();
        },
        { rootMargin: "200px" },
      );
      observer.observe(loader);
    });
    for (let i = 0; i < 3; i++) await page.keyboard.press("k");
    await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
      "href",
      "/sam/status/103",
    );
    await page.keyboard.press("k");
    await page.keyboard.press("k");
    await expect(page.locator('a[href="/alex/status/104"]')).toHaveCount(1);
    await page.keyboard.press("k");
    await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
      "href",
      "/alex/status/104",
    );
  } finally {
    await context.close();
  }
});

for (const [key, target] of [
  ["k", "/jordan/status/102"],
  ["j", "/alex/status/101"],
]) {
  test(`navigation: ${key} crosses an ad-only viewport`, async ({ page }) => {
    await enterAdGap(page);
    await page.keyboard.press(key);
    const after = await page.evaluate(() => scrollY);
    if (key === "k") expect(after).toBeGreaterThan(900);
    else expect(after).toBeLessThan(900);
    await page.keyboard.press(key);
    await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
      "href",
      target,
    );
  });
}

test("navigation: l and n leave offscreen posts alone inside a gap", async ({
  page,
}) => {
  await enterAdGap(page);
  await page.keyboard.press("l");
  await page.keyboard.press("n");
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.likes)).toEqual([]);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
  expect(await page.evaluate(() => window.openedMenus)).toEqual([]);
  expect(await page.evaluate(() => scrollY)).toBe(900);
  await expect(page.locator(".wheel-selected")).toHaveCount(0);
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["102"]);
});

test("navigation: later posts do not cause deferred selection or scrolling", async ({
  page,
}) => {
  await openFeed({ page });
  await page.evaluate(() => {
    document.querySelector("#feed").replaceChildren();
    document.body.style.minHeight = "3000px";
  });
  await page.keyboard.press("k");
  const afterKey = await page.evaluate(() => scrollY);
  expect(afterKey).toBeGreaterThan(0);
  await page.evaluate(() => window.addPost({ id: "104" }));
  await page.waitForTimeout(1700);
  expect(await page.evaluate(() => scrollY)).toBe(afterKey);
  await expect(page.locator(".wheel-selected")).toHaveCount(0);
  expect(await page.evaluate(() => window.likes)).toEqual([]);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
  await page.keyboard.press("j");
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/104",
  );
});
