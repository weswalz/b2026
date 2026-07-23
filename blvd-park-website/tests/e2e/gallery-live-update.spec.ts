import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';

async function loginAdmin(page) {
  await page.goto('/admin/login');
  await page.fill('#api-key', ADMIN_KEY);
  await page.click('text=Sign In');
  await page.waitForURL('**/admin');
}

test('gallery uploads stream to the homepage', async ({ context }) => {
  const home = await context.newPage();
  await home.goto('/');

  const admin = await context.newPage();
  await loginAdmin(admin);
  await admin.goto('/admin/gallery');

  const imagePath = path.join(__dirname, '..', '..', 'public', 'images', 'logos', 'blvd-park-logo.webp');
  await admin.setInputFiles('#gallery-upload', imagePath);

  await expect(admin.getByText(/blvd park logo/i)).toBeVisible();
  await expect(home.locator('img[src*="/uploads/"]').first()).toBeAttached();
});
