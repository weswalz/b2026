import { test, expect } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';

async function loginAdmin(page) {
  await page.goto('/admin/login');
  await page.fill('#api-key', ADMIN_KEY);
  await page.click('text=Sign In');
  await page.waitForURL('**/admin');
}

test('reservation + contact forms appear in admin', async ({ page, context }) => {
  // Reservation form
  await page.goto('/book');
  await page.fill('#firstName', 'Test');
  await page.fill('#lastName', 'Reservation');
  await page.fill('#email', 'test-reservation@example.com');
  await page.fill('#phone', '555-111-2222');
  await page.fill('#date', '2030-01-01');
  await page.selectOption('#time', { label: '7:00 PM' });
  await page.selectOption('#partySize', '4');
  await page.fill('#message', 'Test reservation from Playwright.');
  await page.click('#submitBtn');
  await expect(page.locator('#successMessage')).toBeVisible();

  // Contact form
  await page.goto('/contact');
  await page.fill('#firstName', 'Test');
  await page.fill('#lastName', 'Contact');
  await page.fill('#email', 'test-contact@example.com');
  await page.fill('#phone', '555-333-4444');
  await page.fill('#message', 'Test contact from Playwright.');
  await page.click('#submitBtn');
  await expect(page.locator('#successMessage')).toBeVisible();

  // Admin verification
  const admin = await context.newPage();
  await loginAdmin(admin);

  await admin.goto('/admin/reservations');
  await expect(admin.locator('text=Test Reservation')).toBeVisible();

  await admin.goto('/admin/contact');
  await expect(admin.getByRole('heading', { name: 'Test Contact' })).toBeVisible();
});
