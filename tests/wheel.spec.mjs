import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const fixture = readFileSync(new URL('./feed.html', import.meta.url), 'utf8');
const script = resolve('extension/content.js');
const css = resolve('extension/content.css');

async function start(page) {
  await page.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
  await page.goto('https://x.com/home');
  await page.addStyleTag({ path: css });
  await page.addScriptTag({ path: script });
  await expect(page.locator('.wheel-button')).toHaveCount(3);
}
test.beforeEach(async ({ page }) => start(page));

test('one click sends native feedback for exactly the chosen post and keeps Undo', async ({ page }) => {
  await page.locator('.wheel-button').nth(1).click();
  await expect.poll(() => page.evaluate(() => window.feedback)).toEqual(['102']);
  expect(await page.evaluate(() => window.otherActions)).toEqual([]);
  await expect(page.locator('.native-feedback')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.feedback)).toEqual([]);
  await expect(page.locator('.wheel-button')).toHaveCount(3);
});

test('following, profile, and post detail pages have no wheel buttons', async ({ page }) => {
  await page.getByRole('tab', { name: 'Following', exact: true }).click();
  await expect(page.locator('.wheel-button')).toHaveCount(0);
  await page.getByRole('tab', { name: 'For you', exact: true }).click();
  await expect(page.locator('.wheel-button')).toHaveCount(3);
  await page.evaluate(() => history.pushState({}, '', '/alex'));
  await expect(page.locator('.wheel-button')).toHaveCount(0);
  await page.evaluate(() => history.pushState({}, '', '/home'));
  await expect(page.locator('.wheel-button')).toHaveCount(3);
  await page.evaluate(() => history.pushState({}, '', '/alex/status/101'));
  await expect(page.locator('.wheel-button')).toHaveCount(0);
});

test('handles infinite scrolling, recycled posts, and repeat injection without duplicates', async ({ page }) => {
  await page.evaluate(() => window.addPost('104'));
  await expect(page.locator('.wheel-button')).toHaveCount(4);
  await page.addScriptTag({ path: script });
  await page.evaluate(() => document.querySelector('time').closest('a').href = '/alex/status/999');
  await expect(page.locator('.wheel-button').first()).toHaveAttribute('data-post-key', '999');
  await expect(page.locator('.wheel-button')).toHaveCount(4);
});

test('missing action never triggers mute, block, report, or local dismissal', async ({ page }) => {
  await page.evaluate(() => window.options = ['Mute @example', 'Block @example', 'Report post', 'Not interested in this ad']);
  await page.locator('.wheel-button').first().click();
  await expect(page.getByRole('status')).toContainText('Nothing was changed');
  expect(await page.evaluate(() => window.otherActions)).toEqual([]);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
  await expect(page.locator('article')).toHaveCount(3);
  await expect(page.locator('.wheel-button').first()).toBeEnabled();
});

test('handles delayed menus and delayed feedback labels', async ({ page }) => {
  await page.evaluate(() => { window.menuDelay = 220; window.itemDelay = 220; });
  await page.locator('.wheel-button').first().click();
  await expect.poll(() => page.evaluate(() => window.feedback)).toEqual(['101']);
});

test('does not touch an already open native menu', async ({ page }) => {
  await page.locator('[data-testid=caret]').nth(1).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.locator('.wheel-button').last().click();
  await expect(page.getByRole('status')).toContainText('Close the open menu');
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test('navigation cancels pending feedback', async ({ page }) => {
  await page.evaluate(() => window.menuDelay = 300);
  await page.locator('.wheel-button').first().click();
  await page.getByRole('tab', { name: 'Following', exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  // Wait past the action deadline to ensure no delayed feedback is dispatched.
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test('Escape cancels pending feedback', async ({ page }) => {
  await page.evaluate(() => window.menuDelay = 250);
  await page.locator('.wheel-button').first().click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test('post recycling during the menu wait cancels feedback', async ({ page }) => {
  await page.evaluate(() => window.menuDelay = 250);
  await page.locator('.wheel-button').first().click();
  await page.evaluate(() => document.querySelector('time').closest('a').href = '/alex/status/999');
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => window.feedback)).toEqual([]);
});

test('keyboard activation and the legacy Tweet label work', async ({ page }) => {
  await page.evaluate(() => window.options = ['Not interested in this Tweet', 'Block @example']);
  await page.locator('.wheel-button').first().focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.feedback)).toEqual(['101']);
});

test('does not add controls to ads or nested quoted posts', async ({ page }) => {
  await page.evaluate(() => {
    const ad = window.addPost('105');
    const marker = document.createElement('div'); marker.dataset.testid = 'placementTracking'; ad.append(marker);
    const quote = window.addPost('106'); document.querySelector('article').append(quote);
  });
  await expect(page.locator('.wheel-button')).toHaveCount(3);
});

test('button is compact in light and dark layouts', async ({ page }, testInfo) => {
  const button = page.locator('.wheel-button').first();
  await expect(button).toHaveAccessibleName('Not interested');
  const box = await button.boundingBox();
  expect(box.width).toBe(32); expect(box.height).toBe(32);
  await page.screenshot({ path: testInfo.outputPath('wheel-light.png') });
  await page.evaluate(() => document.body.classList.add('dark'));
  await button.hover();
  await page.screenshot({ path: testInfo.outputPath('wheel-dark.png') });
});
