import { test, expect } from "@playwright/test";
import { openFeed, wrapInFeedCells } from "./helpers.mjs";

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

test.beforeEach(async ({ page }) => openFeed({ page }));

test("navigation skips ads and nested quoted posts", async ({ page }) => {
  await page.evaluate(() => {
    const ad = window.addPost({ id: "105" });
    const marker = document.createElement("div");
    marker.dataset.testid = "placementTracking";
    ad.before(marker);
    marker.append(ad);
    const quote = window.addPost({ id: "106" });
    document.querySelector("article").append(quote);
  });
  for (let i = 0; i < 5; i++) await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
});

test("regression: media tracking inside ordinary posts cannot stall navigation after feedback", async ({
  page,
}) => {
  await page.evaluate(() => {
    for (const post of [...document.querySelectorAll("article")].slice(1)) {
      const media = document.createElement("div");
      media.dataset.testid = "placementTracking";
      media.append(document.createElement("video"));
      post.append(media);
    }
    // A real ad wraps its article, unlike the media tracker inside an
    // ordinary post. It must still be excluded even with a valid timestamp.
    const ad = window.addPost({ id: "104" });
    const wrapper = document.createElement("div");
    wrapper.dataset.testid = "placementTracking";
    ad.before(wrapper);
    wrapper.append(ad);
    document.querySelectorAll("article")[0].after(wrapper);
  });
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  await page.keyboard.press("j");
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await page.keyboard.press("j");
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["102"]);
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
});

test("regression: quoted ad indicators do not classify the enclosing post as an ad", async ({
  page,
}) => {
  await page.evaluate(() => {
    const quote = window.addPost({ id: "104" });
    const indicator = document.createElement("div");
    indicator.dataset.testid = "promotedIndicator";
    quote.append(indicator);
    document.querySelector("article").append(quote);
  });
  await page.keyboard.press("k");
  await expect(page.locator("article.wheel-selected")).toHaveCount(1);
  await expect(
    page.locator(".wheel-selected").locator(":scope > .post-body a:has(time)"),
  ).toHaveAttribute("href", "/alex/status/101");
});

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
    "Skipped — feedback unavailable; nothing sent.",
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
  await page.locator("article").evaluateAll(wrapInFeedCells);
  await page.evaluate(() => {
    const posts = [...document.querySelectorAll("article")];
    for (const post of posts) post.style.position = "relative";
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

for (const hiddenStyle of ["visibility:hidden", "opacity:0"]) {
  test(`regression: avatar rails with ${hiddenStyle} cannot redirect a like`, async ({
    page,
  }) => {
    await page.locator("article").evaluateAll(wrapInFeedCells);
    await page.evaluate((hiddenStyle) => {
      const posts = [...document.querySelectorAll("article")];
      for (const post of posts) post.style.position = "relative";
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
