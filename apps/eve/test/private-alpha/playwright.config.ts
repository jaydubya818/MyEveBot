import path from "node:path";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: path.resolve(
          import.meta.dirname,
          "../../../../docs/verification/private-alpha/browser.json",
        ),
      },
    ],
  ],
  outputDir: path.resolve(
    import.meta.dirname,
    "../../../../output/playwright/private-alpha/artifacts",
  ),
  use: {
    baseURL: "http://127.0.0.1:3196",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
