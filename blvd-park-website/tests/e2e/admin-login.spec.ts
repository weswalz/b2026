import { test, expect } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';

test('admin login succeeds', async ({ page }) => {
  await page.goto('/admin/login');
  await page.fill('#api-key', ADMIN_KEY);
  await page.click('text=Sign In');
  await page.waitForURL('**/admin');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
