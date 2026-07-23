import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const backendPort = 3001;
const frontendPort = 3000;
const baseURL = `http://127.0.0.1:${frontendPort}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDbPath = path.join(__dirname, 'backend', 'database', 'test.db');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'node backend/server.js',
      cwd: __dirname,
      port: backendPort,
      reuseExistingServer: true,
      env: {
        ...process.env,
        PORT: String(backendPort),
        ADMIN_API_KEY: 'test-admin-key',
        DB_PATH: testDbPath,
        RESET_DB: 'true',
        FRONTEND_URLS: baseURL,
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1',
      cwd: __dirname,
      port: frontendPort,
      reuseExistingServer: true,
      env: {
        ...process.env,
        PUBLIC_API_URL: `http://127.0.0.1:${backendPort}`,
      },
    },
  ],
});
