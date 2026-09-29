import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "../../../apps/eve/test/browser", testMatch: "chat-turn-failure.spec.cjs", workers: 1, reporter: "list", outputDir: "/private/tmp/consolidation-chat-browser", use: { channel: "chrome", headless: true } });
