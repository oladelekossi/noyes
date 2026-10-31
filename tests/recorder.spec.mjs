import { test, expect, chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fixture } from "./fixture.mjs";

// This file builds one shared unpacked extension; do not rebuild it from
// concurrent workers while another recorder test is loading its files.
test.describe.configure({ mode: "default" });

const output = resolve("dist/noyes-debug");
execFileSync(process.execPath, ["scripts/build-debug.mjs"]);
const manifest = JSON.parse(readFileSync(resolve(output, "manifest.json")));

async function openRecorder({ page }) {
  await page.route("https://x.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: fixture }),
  );
  await page.goto("https://x.com/home");
  for (const file of manifest.content_scripts[0].css)
    await page.addStyleTag({ path: resolve(output, file) });
  for (const file of manifest.content_scripts[0].js)
    await page.addScriptTag({ path: resolve(output, file) });
}

test("records consumed keys, anonymous lifecycle changes and a marked outline failure", async ({
  page,
}) => {
  await openRecorder({ page });
  expect(await page.evaluate(() => __noyes.recorder.data().records)).toEqual(
    [],
  );
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await page.evaluate(() => {
    const post = document.querySelector(".noyes-selected");
    post.querySelector(".post-text").textContent = "PRIVATE-SENTINEL-SECRET";
    const original = post.cloneNode(true);
    post.replaceWith(original);
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        __noyes.recorder.data().records.some((r) => r.type === "dom-batch"),
      ),
    )
    .toBe(true);
  // Simulate the recorded symptom: X unmounts the selected article.
  await page.evaluate(() => document.querySelector(".noyes-selected").remove());
  await expect
    .poll(() =>
      page.evaluate(() =>
        __noyes.recorder
          .data()
          .records.some(
            (r) => r.state?.diagnosis === "selected-item-missing-from-feed",
          ),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Bug here" }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const data = await page.evaluate(() => __noyes.recorder.data());
  expect(
    data.records.some(
      (r) =>
        r.type === "keydown-after" &&
        r.detail.key === "k" &&
        r.detail.prevented,
    ),
  ).toBe(true);
  expect(
    data.records.some(
      (r) => r.type === "call-after" && r.detail.method === "navigate",
    ),
  ).toBe(true);
  expect(data.records.some((r) => r.type === "bug-marker")).toBe(true);
  expect(data.build["selection.js"]).toMatch(/^[0-9a-f]{64}$/);
  expect(data.records.map((r) => r.seq)).toEqual(
    Array.from(data.records.keys(), (i) => i + 1),
  );
  expect(JSON.stringify(data)).not.toContain("PRIVATE-SENTINEL-SECRET");
  expect(JSON.stringify(data)).not.toContain("/status/");
  const before = data.records.length;
  await page.keyboard.press("j");
  expect(
    (await page.evaluate(() => __noyes.recorder.data().records)).length,
  ).toBe(before);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export replay" }).click();
  const file = await (await download).path();
  const html = readFileSync(file, "utf8");
  expect(html).not.toContain("PRIVATE-SENTINEL-SECRET");
  expect(html).not.toContain("__NOYES_DATA__");
  const report = await page.context().newPage();
  await report.setContent(html);
  await expect(report.locator("h1")).toHaveText("noyes flight recorder");
  await report.getByRole("button", { name: "Next bug marker" }).click();
  await expect(report.locator("#diagnosis")).toHaveText(
    "selected-item-missing-from-feed",
  );
  await expect(report.locator("#detail")).toContainText("bug-marker");
  await report.getByRole("button", { name: "Previous event" }).click();
  await report.getByRole("button", { name: "Next event", exact: true }).click();
  await expect(report.locator("#detail")).toContainText("bug-marker");
});

test("typing stays private and recorder controls preserve alignment", async ({
  page,
}) => {
  await openRecorder({ page });
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.keyboard.press("k");
  await expect(page.locator("html")).toHaveClass(/noyes-aligning/);
  await page.getByRole("button", { name: "Bug here" }).click();
  await expect(page.locator("html")).toHaveClass(/noyes-aligning/);
  await page.evaluate(() => {
    const input = document.createElement("input");
    document.body.prepend(input);
    input.focus();
  });
  await page.keyboard.type("private-njkl-password");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const data = await page.evaluate(() => __noyes.recorder.data());
  const keys = data.records.filter((r) => r.type === "keydown-before");
  expect(keys.map((r) => r.detail.key)).toEqual(["k"]);
  expect(JSON.stringify(data)).not.toContain("private-njkl-password");
});

test("feedback diagnostics distinguish unrecognized text without dispatching it", async ({
  page,
}) => {
  await openRecorder({ page });
  await page.evaluate(() => {
    window.options = [
      "Not interested in this topic",
      "Mute @diagnostic-secret",
    ];
  });
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.keyboard.press("n");
  await expect(page.locator(".noyes-notice")).toHaveText(
    "Skipped — feedback unavailable; nothing sent.",
  );
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
  const unavailable = await page.evaluate(() => __noyes.recorder.data());
  const locating = unavailable.records.find(
    (r) => r.state?.feedbackState === "locating" && r.state.menus.length,
  );
  expect(locating.state.menus).toEqual([
    { itemCount: 2, hasExactFeedback: false, hasFeedbackText: true },
  ]);
  expect(unavailable.records.at(-1).state.feedbackOutcome).toBe("unavailable");
  expect(JSON.stringify(unavailable)).not.toContain("diagnostic-secret");
  expect(JSON.stringify(unavailable)).not.toContain(
    "Not interested in this topic",
  );
  await page.evaluate(() => {
    window.options = ["Not interested in this post", "Mute @diagnostic-secret"];
  });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["102"]);
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  const sent = await page.evaluate(() => __noyes.recorder.data());
  expect(
    sent.records.some((r) =>
      r.state?.menus.some((menu) => menu.hasExactFeedback),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});

test("debug build captures in Chrome's real isolated world without manual injection", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    executablePath:
      process.env.NOYES_CHROMIUM_EXECUTABLE || chromium.executablePath(),
    args: [
      `--disable-extensions-except=${output}`,
      `--load-extension=${output}`,
    ],
  });
  try {
    const page = await context.newPage();
    await page.route("https://x.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: fixture }),
    );
    await page.goto("https://x.com/home");
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await page.keyboard.press("k");
    await expect(page.locator(".noyes-selected")).toHaveCount(1);
    await page.keyboard.press("n");
    await expect
      .poll(() => page.evaluate(() => window.feedback))
      .toEqual(["101"]);
    await page.keyboard.press("j");
    await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
      "href",
      "/alex/status/101",
    );
    expect(await page.evaluate(() => window.feedback)).toEqual([]);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export replay" }).click();
    const html = readFileSync(await (await download).path(), "utf8");
    const data = JSON.parse(
      html.match(
        /<script id="noyes-data" type="application\/json">\s*([\s\S]*?)<\/script>/,
      )[1],
    );
    expect(
      data.records.some(
        (r) => r.type === "keydown-after" && r.detail.prevented,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
