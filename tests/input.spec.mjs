import { test, expect } from "@playwright/test";
import { openFeed, inject } from "./helpers.mjs";

test.beforeEach(async ({ page }) => openFeed({ page }));

test("selection clears outside For You and shortcuts leave other pages alone", async ({
  page,
}) => {
  await page.keyboard.press("k");
  await page.getByRole("tab", { name: "Following", exact: true }).click();
  await expect(page.locator(".noyes-selected")).toHaveCount(0);
  await page.keyboard.press("l");
  await page.getByRole("tab", { name: "For you", exact: true }).click();
  for (const path of ["/alex", "/alex/status/101"]) {
    await page.evaluate(() => history.pushState({}, "", "/home"));
    await page.keyboard.press("k");
    await page.evaluate((path) => history.pushState({}, "", path), path);
    await expect(page.locator(".noyes-selected")).toHaveCount(0);
    await page.keyboard.press("l");
  }
  expect(await page.evaluate(() => window.likes)).toEqual([]);
});

test("repeat injection does not duplicate shortcut handlers", async ({
  page,
}) => {
  await inject({ page });
  await page.keyboard.press("l");
  expect(await page.evaluate(() => window.likes)).toEqual(["101"]);
  await expect(page.locator(".noyes-selected a:has(time)")).toHaveAttribute(
    "href",
    "/jordan/status/102",
  );
});

test("typing, composition, and modifier shortcuts do not trigger noyes", async ({
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
  await expect(page.locator(".noyes-selected")).toHaveCount(0);
});

test("shortcuts respect dialogs and other feed tabs", async ({ page }) => {
  await page.evaluate(() => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.textContent = "Compose";
    document.body.append(dialog);
  });
  for (const key of ["k", "l", "n"]) await page.keyboard.press(key);
  await expect(page.locator(".noyes-selected")).toHaveCount(0);
  await page.evaluate(() => document.querySelector("[role=dialog]").remove());
  await page.getByRole("tab", { name: "Following", exact: true }).click();
  for (const key of ["k", "l", "n"]) await page.keyboard.press(key);
  expect(await page.evaluate(() => window.likes)).toEqual([]);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});
