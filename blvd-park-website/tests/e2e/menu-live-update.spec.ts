import { test, expect } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';

async function loginAdmin(page) {
  await page.goto('/admin/login');
  await page.fill('#api-key', ADMIN_KEY);
  await page.click('text=Sign In');
  await page.waitForURL('**/admin');
}

test('menu items added in admin appear on the menu page', async ({ context }) => {
  const menu = await context.newPage();
  await menu.goto('/menu');

  const admin = await context.newPage();
  await loginAdmin(admin);
  await admin.goto('/admin/menu');

  await admin.getByRole('button', { name: 'Add Item' }).click();
  await admin.fill('input[name="name"]', 'Playwright Burger');
  await admin.fill('input[name="price"]', '12.5');
  await admin.selectOption('select[name="category"]', 'food');
  await admin.fill('textarea[name="description"]', 'Test menu item.');
  await admin.getByRole('button', { name: 'Save Item' }).click();

  await expect(admin.getByText('Playwright Burger')).toBeVisible();
  await expect(menu.getByText('Playwright Burger')).toBeVisible();
});
