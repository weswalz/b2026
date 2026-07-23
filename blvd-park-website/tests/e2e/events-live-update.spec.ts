import { test, expect } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';

async function loginAdmin(page) {
  await page.goto('/admin/login');
  await page.fill('#api-key', ADMIN_KEY);
  await page.click('text=Sign In');
  await page.waitForURL('**/admin');
}

test('events created in admin stream to the homepage', async ({ context }) => {
  const home = await context.newPage();
  await home.goto('/');

  const admin = await context.newPage();
  await loginAdmin(admin);
  await admin.goto('/admin/events');

  await admin.getByRole('button', { name: 'Add Event' }).click();
  await admin.fill('input[name="title"]', 'Playwright Test Event');
  await admin.fill('input[name="date"]', '2030-02-10');
  await admin.fill('input[name="time"]', '19:00');
  await admin.fill('textarea[name="description"]', 'Test event description.');
  await admin.selectOption('select[name="category"]', 'special');
  await admin.getByRole('button', { name: 'Save Event' }).click();

  await expect(admin.getByText('Playwright Test Event')).toBeVisible();

  await expect(home.locator('#events')).toBeVisible();
  await expect(home.locator('#featured-title')).toHaveText('Playwright Test Event');
  await expect(home.locator('#featured-description')).toHaveText('Test event description.');
});
