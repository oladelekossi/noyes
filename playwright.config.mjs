import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 15000,
  use: {
    headless: true,
    viewport: { width: 1080, height: 820 },
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    screenshot: "only-on-failure",
  },
});
