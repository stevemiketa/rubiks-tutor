import { defineConfig, devices } from '@playwright/test'

// The journeys run against the built Go binary. e2e/global-setup.ts starts it
// on a port the OS picks and publishes the address as CUBULAR_BASE_URL before
// the workers start, so suites in several worktrees can run at once. Set
// CUBULAR_BASE_URL yourself to test a server that is already running.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.CUBULAR_BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
