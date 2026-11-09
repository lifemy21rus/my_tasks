// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer']
    },
    timeout: 30000
  },
  projects: [
    {
      name: 'electron',
      use: devices['Desktop Chrome']
    }
  ]
});
