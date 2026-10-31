import { test, expect } from "@playwright/test";
import {
  openFeed,
  wrapInFeedCells,
  restoreSameArticleOnUndo,
} from "./helpers.mjs";

test.beforeEach(async ({ page }) => openFeed({ page }));

test("regression: Undo restores keyboard access to the same article", async ({
  page,
}) => {
  await page.locator("article").first().evaluate(restoreSameArticleOnUndo);
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

test("regression: Undo after the final dismissal restores selection", async ({
  page,
}) => {
  await page.evaluate(() => {
    const posts = [...document.querySelectorAll("article")];
    posts.slice(1).forEach((post) => post.remove());
  });
  await page.locator("article").first().evaluate(restoreSameArticleOnUndo);
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await expect(page.locator(".wheel-selected")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["101"]);
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
    await page.locator("article").first().evaluateAll(wrapInFeedCells);
    await page.evaluate((layout) => {
      const post = document.querySelector("article");
      const children = [...post.childNodes];
      const cell = post.closest('[data-testid="cellInnerDiv"]');
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
    await page.locator("article").first().evaluateAll(wrapInFeedCells);
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
