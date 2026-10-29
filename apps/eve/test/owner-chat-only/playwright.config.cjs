const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({ testDir: __dirname, testMatch: 'chat-only.spec.cjs', workers: 1,
  retries: 0, timeout: 360000, expect: { timeout: 45000 }, reporter: [['list']],
  outputDir: process.env.MYEVE_CHAT_ONLY_BROWSER_OUTPUT,
  use: { channel: 'chromium', headless: true, actionTimeout: 30000,
    navigationTimeout: 60000, trace: 'off', screenshot: 'off' },
});
