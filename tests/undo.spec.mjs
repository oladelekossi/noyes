import { test, expect } from "@playwright/test";
import {
  openFeed,
  wrapInFeedCells,
  restoreSameArticleOnUndo,
} from "./helpers.mjs";

test.beforeEach(async ({ page }) => openFeed({ page }));

async function nativeUndoInPlace({ page, delay = 0 }) {
  await page.evaluate((delay) => {
    const originals = new Map(
      [...document.querySelectorAll("article")].map((post) => [
        post,
        { key: __noyes.x.postId({ post }), children: [...post.childNodes] },
      ]),
    );
    window.undoClicks = [];
    document.addEventListener(
      "click",
      (event) => {
        if (!event.target.matches(".undo")) return;
        const post = event.target.closest("article");
        const original = originals.get(post);
        if (!original) return;
        event.stopImmediatePropagation();
        window.undoClicks.push(original.key);
        window.feedback = window.feedback.filter((key) => key !== original.key);
        event.target.remove();
        setTimeout(() => post.replaceChildren(...original.children), delay);
      },
      true,
    );
  }, delay);
}

test("backward navigation restores the dismissed predecessor through native Undo", async ({
  page,
}) => {
  await page.locator("article").first().evaluate(restoreSameArticleOnUndo);
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  await page.keyboard.press("j");
  await expect.poll(() => page.evaluate(() => window.feedback)).toEqual([]);
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/101",
  );
});

test("backward navigation restores consecutive dismissals in feed order", async ({
  page,
}) => {
  await nativeUndoInPlace({ page });
  for (const dismissed of [["101"], ["101", "102"]]) {
    await page.keyboard.press("n");
    await expect
      .poll(() => page.evaluate(() => window.feedback))
      .toEqual(dismissed);
  }
  await page.keyboard.press("j");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  await page.keyboard.press("j");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/101",
  );
  expect(await page.evaluate(() => window.undoClicks)).toEqual(["102", "101"]);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
  await page.keyboard.press("u");
  await expect(page.locator(".noyes-notice")).toHaveText("Undo unavailable.");
});

test("backward navigation visits an ordinary predecessor before an older dismissal", async ({
  page,
}) => {
  await nativeUndoInPlace({ page });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.keyboard.press("k");
  await page.keyboard.press("j");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
  await page.keyboard.press("j");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/101",
  );
  expect(await page.evaluate(() => window.undoClicks)).toEqual(["101"]);
});

test("restoring an older predecessor preserves the latest-only u target", async ({
  page,
}) => {
  await nativeUndoInPlace({ page });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.keyboard.press("k");
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101", "103"]);
  await page.keyboard.press("j");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/101",
  );
  await page.keyboard.press("u");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  expect(await page.evaluate(() => window.undoClicks)).toEqual(["101", "103"]);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test("an unavailable nearest Undo never restores a farther dismissal", async ({
  page,
}) => {
  await nativeUndoInPlace({ page });
  for (const expected of [["101"], ["101", "102"]]) {
    await page.keyboard.press("n");
    await expect
      .poll(() => page.evaluate(() => window.feedback))
      .toEqual(expected);
  }
  await page
    .locator(".undo")
    .nth(1)
    .evaluate((undo) => undo.remove());
  await page.keyboard.press("j");
  await expect(page.locator(".noyes-notice")).toHaveText("Undo unavailable.");
  expect(await page.evaluate(() => window.feedback)).toEqual(["101", "102"]);
  expect(await page.evaluate(() => window.undoClicks)).toEqual([]);
});

for (const source of ["wheel", "native"]) {
  test(`a recycled dismissal scope cannot give ${source} Undo to the old identity`, async ({
    page,
  }) => {
    await page.locator("article").evaluateAll(wrapInFeedCells);
    await page.evaluate(() => {
      const posts = [...document.querySelectorAll("article")];
      const original = new Map(
        posts.map((post) => [__noyes.x.postId({ post }), post]),
      );
      window.undoClicks = [];
      document.addEventListener(
        "click",
        (event) => {
          if (event.target.getAttribute("role") !== "menuitem") return;
          event.stopImmediatePropagation();
          const key = window.openedMenus.at(-1);
          const post = original.get(key);
          const scope = post.closest('[data-testid="cellInnerDiv"]');
          window.feedback.push(key);
          event.target.closest('[role="menu"]').remove();
          const undo = document.createElement("button");
          undo.textContent = "Undo";
          scope.replaceChildren(undo);
          undo.onclick = () => {
            window.undoClicks.push(key);
            window.feedback = window.feedback.filter((id) => id !== key);
            scope.replaceChildren(post);
          };
        },
        true,
      );
    });
    await page.keyboard.press("n");
    await expect
      .poll(() => page.evaluate(() => window.feedback))
      .toEqual(["101"]);
    await page.evaluate(() => {
      const recycled = document.querySelector('[data-testid="cellInnerDiv"]');
      const nextPost = document
        .querySelector('a[href="/jordan/status/102"]')
        .closest("article");
      recycled.replaceChildren(nextPost);
    });
    if (source === "wheel") await page.keyboard.press("n");
    else {
      await page
        .locator("article")
        .filter({ has: page.locator('a[href="/jordan/status/102"]') })
        .getByRole("button", { name: "More", exact: true })
        .click();
      await page
        .getByRole("menuitem", {
          name: "Not interested in this post",
          exact: true,
        })
        .click();
    }
    await expect
      .poll(() => page.evaluate(() => window.feedback))
      .toEqual(["101", "102"]);
    if (source === "native") await page.keyboard.press("k");
    await page.keyboard.press("j");
    if (source === "wheel") {
      await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
        "href",
        "/jordan/status/102",
      );
      expect(await page.evaluate(() => window.undoClicks)).toEqual(["102"]);
    } else {
      await page.keyboard.press("u");
      expect(await page.evaluate(() => window.feedback)).toEqual([
        "101",
        "102",
      ]);
      expect(await page.evaluate(() => window.undoClicks)).toEqual([]);
      await expect(
        page.getByRole("button", { name: "Undo", exact: true }),
      ).toHaveCount(1);
    }
  });
}

test("repeated backward navigation waits for native remount without another Undo", async ({
  page,
}) => {
  await nativeUndoInPlace({ page, delay: 300 });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/101",
  );
  expect(await page.evaluate(() => window.undoClicks)).toEqual(["101"]);
});

test("forward navigation cancels alignment while native Undo remounts", async ({
  page,
}) => {
  await nativeUndoInPlace({ page, delay: 300 });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.keyboard.press("j");
  await page.keyboard.press("k");
  await page.waitForTimeout(450);
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  expect(await page.evaluate(() => window.undoClicks)).toEqual(["101"]);
});

test("backward navigation initializes from the visible feed after selection clears", async ({
  page,
}) => {
  await nativeUndoInPlace({ page });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.getByRole("tab", { name: "Following", exact: true }).click();
  await expect(page.locator(".noyes-selected")).toHaveCount(0);
  await page.getByRole("tab", { name: "For you", exact: true }).click();
  await page.keyboard.press("j");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
});

test("backward navigation after manual scrolling does not restore an offscreen predecessor", async ({
  page,
}) => {
  await page.addStyleTag({
    content: "article{min-height:500px}body{padding-bottom:1800px}",
  });
  await nativeUndoInPlace({ page });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() =>
      page
        .locator('a[href="/jordan/status/102"]')
        .evaluate((a) => a.closest("article").getBoundingClientRect().bottom),
    )
    .toBeLessThan(100);
  await page.keyboard.press("j");
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
});

test("repeated backward navigation cannot extend the native restoration deadline", async ({
  page,
}) => {
  await page.addStyleTag({
    content: "article{min-height:500px}body{padding-bottom:1800px}",
  });
  await nativeUndoInPlace({ page, delay: 1900 });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["101"]);
  await page.keyboard.press("j");
  const before = await page.evaluate(() => scrollY);
  await page.waitForTimeout(850);
  await page.keyboard.press("j");
  await page.waitForTimeout(1200);
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/101",
  );
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await expect(page.locator("html")).not.toHaveClass(/noyes-aligning/);
  expect(await page.evaluate(() => window.undoClicks)).toEqual(["101"]);
});

test("backward navigation restores a dismissed reply in a shared conversation cell", async ({
  page,
}) => {
  await page.evaluate(() => {
    const posts = [...document.querySelectorAll("article")];
    const cell = document.createElement("div");
    cell.dataset.testid = "cellInnerDiv";
    posts[0].before(cell);
    cell.append(posts[0], posts[1]);
  });
  await nativeUndoInPlace({ page });
  await page.keyboard.press("n");
  await expect
    .poll(() => page.evaluate(() => window.feedback))
    .toEqual(["102"]);
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/sam/status/103",
  );
  await page.keyboard.press("j");
  await expect(page.locator("article.noyes-selected")).toHaveCount(2);
  await expect(page.locator(".noyes-thread-end a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
  expect(await page.evaluate(() => window.undoClicks)).toEqual(["102"]);
});

for (const obstruction of ["missing", "ambiguous", "recycled"]) {
  test(`backward navigation refuses ${obstruction} native Undo`, async ({
    page,
  }) => {
    await nativeUndoInPlace({ page });
    await page.keyboard.press("n");
    await expect
      .poll(() => page.evaluate(() => window.feedback))
      .toEqual(["101"]);
    await page.evaluate((obstruction) => {
      const undo = document.querySelector(".undo");
      if (obstruction === "missing") undo.remove();
      if (obstruction === "ambiguous") undo.after(undo.cloneNode(true));
      if (obstruction === "recycled") {
        const post = undo.closest("article");
        const replacement = window.addPost({ id: "999" });
        replacement.append(undo);
        post.replaceWith(replacement);
      }
    }, obstruction);
    await page.keyboard.press("j");
    expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
    expect(await page.evaluate(() => window.undoClicks)).toEqual([]);
    if (obstruction !== "recycled")
      await expect(page.locator(".noyes-notice")).toHaveText(
        "Undo unavailable.",
      );
  });
}

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
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
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
  await expect(page.locator(".noyes-selected")).toHaveCount(0);
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
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
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
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/alex/status/102",
  );
  await page.keyboard.press("u");
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
  await expect(page.locator(".noyes-notice")).toHaveText("Undo unavailable.");
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
    await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
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
    await expect(page.locator(".noyes-notice")).toHaveText("Undo unavailable.");
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
  await expect(page.locator(".noyes-notice")).toHaveText("Undo unavailable.");
  expect(await page.evaluate(() => window.feedback)).toEqual(["101"]);
  await page.evaluate(() => (document.querySelector(".undo").hidden = false));
  await page.keyboard.press("u");
  await expect.poll(() => page.evaluate(() => window.feedback)).toEqual([]);
  await expect(page.locator(".noyes-notice")).toHaveCount(0);
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
