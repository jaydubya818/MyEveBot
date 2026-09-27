import path from "node:path";
import { defineConfig } from "@playwright/test";
const output =
  process.env.MYEVE_OWNER_EVIDENCE_DIR ??
  path.resolve(
    import.meta.dirname,
    "../../../../output/playwright/beta-product-experience",
  );
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: path.join(output, "report.json"),
      },
    ],
  ],
  outputDir: path.join(output, "artifacts"),
  use: {
    baseURL: "http://127.0.0.1:3091",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
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
