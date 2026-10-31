import { chromium, test, expect } from "@playwright/test";
import { fixture } from "./fixture.mjs";
import { resolve } from "node:path";

test("packaged extension injects automatically and sends native feedback", async () => {
  const extension = resolve("extension");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    executablePath:
      process.env.NOYES_CHROMIUM_EXECUTABLE || chromium.executablePath(),
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    const page = await context.newPage();
    await page.route("https://x.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: fixture,
      }),
    );
    await page.goto("https://x.com/home");
    // No addScriptTag: Chrome must load the real manifest and isolated content script.
    await page.keyboard.press("k");
    await page.keyboard.press("k");
    await page.keyboard.press("l");
    await expect.poll(() => page.evaluate(() => window.likes)).toEqual(["102"]);
    await expect(page.locator(".noyes-selected")).toHaveCSS(
      "outline",
      "rgb(34, 197, 94) solid 2px",
    );
    await page.keyboard.press("j");
    await page.keyboard.press("n");
    await expect
      .poll(() => page.evaluate(() => window.feedback))
      .toEqual(["102"]);
    expect(await page.evaluate(() => window.otherActions)).toEqual([]);
    expect(await page.evaluate(() => window.nativeKeys)).toEqual([]);
    await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
      "href",
      "/sam/status/103",
    );
  } finally {
    await context.close();
  }
});
