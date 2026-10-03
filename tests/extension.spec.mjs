import { chromium, test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('packaged extension injects automatically and sends native feedback', async () => {
  const extension = resolve('extension');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    executablePath: process.env.WHEEL_CHROMIUM_EXECUTABLE || chromium.executablePath(),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  try {
    const page = await context.newPage();
    await page.route('https://x.com/**', route => route.fulfill({
      contentType: 'text/html', body: readFileSync(new URL('./feed.html', import.meta.url), 'utf8')
    }));
    await page.goto('https://x.com/home');
    // No addScriptTag: Chrome must load the real manifest and isolated content script.
    await expect(page.locator('.wheel-button')).toHaveCount(3);
    await expect(page.locator('.wheel-button').first()).toHaveCSS('width', '32px');
    await page.locator('.wheel-button').nth(1).click();
    await expect.poll(() => page.evaluate(() => window.feedback)).toEqual(['102']);
    expect(await page.evaluate(() => window.otherActions)).toEqual([]);
  } finally { await context.close(); }
});
