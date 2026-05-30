import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  outputDir: "./.tmp/playwright/test-results",
  use: {
    headless: true,
  },
});
