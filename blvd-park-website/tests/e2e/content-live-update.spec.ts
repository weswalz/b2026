import { test, expect } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';

test('content edits stream live to the public site', async ({ context }) => {
  const home = await context.newPage();
  await home.goto('/');
  await expect(home.locator('[data-cms-key="home.hero.headline_top"]')).toBeVisible();

  const admin = await context.newPage();
  await admin.goto('/admin/login');
  await admin.fill('#api-key', ADMIN_KEY);
  await admin.click('text=Sign In');
  await admin.waitForURL('**/admin');

  await admin.goto('/admin/content');
  const field = admin.locator('[id="home.hero.headline_top"]');
  await expect(field).toBeVisible();
  await field.fill('Test Headline');
  await admin.click('text=Save Changes');

  await expect(home.locator('[data-cms-key="home.hero.headline_top"]')).toHaveText('Test Headline');
});
