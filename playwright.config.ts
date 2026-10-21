import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dev = process.env.PLAYWRIGHT_DEV === '1';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1080 },
    launchOptions: existsSync(macChrome) ? { executablePath: macChrome } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: dev ? 'npm run dev -- --port 4173 --strictPort' : 'python3 -m http.server 4173 --bind 127.0.0.1 --directory dist',
    url: 'http://127.0.0.1:4173/ja/',
    reuseExistingServer: false,
    timeout: dev ? 120000 : 15000,
  },
});
