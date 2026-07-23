import { test, expect } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';

async function loginAdmin(page) {
  await page.goto('/admin/login');
  await page.fill('#api-key', ADMIN_KEY);
  await page.click('text=Sign In');
  await page.waitForURL('**/admin');
}

test('hours edits stream to the homepage', async ({ context }) => {
  const home = await context.newPage();
  await home.goto('/');

  const admin = await context.newPage();
  await loginAdmin(admin);
  await admin.goto('/admin/hours');

  await admin.fill('[data-testid="hours-open-1"]', '10:00');
  await admin.fill('[data-testid="hours-close-1"]', '20:00');

  const saveButton = admin.getByRole('button', { name: 'Save Changes' });
  await expect(saveButton).toBeVisible();
  await saveButton.click();

  const mondayRow = home.locator('#hours-list [data-day="1"]');
  await expect(mondayRow).toContainText('10AM');
  await expect(mondayRow).toContainText('8PM');
});
