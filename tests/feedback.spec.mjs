import { test, expect } from "@playwright/test";
import { openFeed } from "./helpers.mjs";

test.beforeEach(async ({ page }) => openFeed({ page }));

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

test("holding n sends feedback only once", async ({ page }) => {
  await page.keyboard.down("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.keyboard.down("n");
  await page.keyboard.up("n");
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
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
    "Skipped — feedback unavailable; nothing sent.",
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

test("drift: unrecognizable posts show one layout notice", async ({ page }) => {
  await page.evaluate(() =>
    document
      .querySelectorAll("article")
      .forEach((post) => post.removeAttribute("data-testid")),
  );
  const notice = page.locator(".wheel-notice");
  await expect(notice).toHaveText(
    "noyes can't read this feed layout — shortcuts are off until noyes is updated.",
    { timeout: 5000 },
  );
  await page.keyboard.press("k");
  await expect(page.locator(".wheel-selected")).toHaveCount(0);
});

test("drift: a readable feed never shows the layout notice", async ({
  page,
}) => {
  await page.waitForTimeout(2500);
  await expect(page.locator(".wheel-notice")).toHaveCount(0);
});

test("drift: a post with no like control says so once", async ({ page }) => {
  await page.evaluate(() =>
    document
      .querySelectorAll("[data-testid=like]")
      .forEach((like) => like.remove()),
  );
  await page.keyboard.press("l");
  await expect(page.locator(".wheel-notice")).toHaveText(
    "Like control not found.",
  );
  expect(await page.evaluate(() => window.likes)).toEqual([]);
});

test("drift: an already liked post stays silent", async ({ page }) => {
  await page.evaluate(() => {
    const like = document.querySelector("[data-testid=like]");
    like.dataset.testid = "unlike";
  });
  await page.keyboard.press("l");
  await expect(page.locator(".wheel-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  await expect(page.locator(".wheel-notice")).toHaveCount(0);
  expect(await page.evaluate(() => window.likes)).toEqual([]);
});
