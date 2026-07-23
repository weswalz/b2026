import { test, expect } from '@playwright/test';

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';
const API_URL = process.env.PUBLIC_API_URL || 'http://127.0.0.1:3001';

async function loginAdmin(page) {
  await page.goto('/admin/login');
  await page.fill('#api-key', ADMIN_KEY);
  await page.click('text=Sign In');
  await page.waitForURL('**/admin');
}

test('private event inquiries appear in admin and can be updated', async ({ request, page }) => {
  const payload = {
    name: 'Playwright Private Event',
    email: 'private-event@example.com',
    phone: '555-777-8888',
    company: 'Playwright Co',
    eventType: 'corporate',
    preferredDate: '2030-03-15',
    guestCount: 80,
    budget: '$5000',
    details: 'Playwright private event inquiry.',
  };

  const response = await request.post(`${API_URL}/api/private-events`, { data: payload });
  expect(response.ok()).toBeTruthy();

  await loginAdmin(page);
  await page.goto('/admin/private-events');

  const card = page.locator('.space-y-4 > div').filter({ hasText: payload.name }).first();
  await expect(card).toBeVisible();
  await card.click();

  await expect(page.getByText('Event Inquiry Details')).toBeVisible();

  const statusSelect = page.locator('select').first();
  await statusSelect.selectOption('contacted');

  await expect(page.getByText('Event Inquiry Details')).toBeHidden();
  await expect(card).toContainText('contacted');
});
