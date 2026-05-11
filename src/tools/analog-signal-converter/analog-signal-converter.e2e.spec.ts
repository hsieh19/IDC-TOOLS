import { test, expect } from '@playwright/test';

test.describe('Tool - Analog signal converter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analog-signal-converter');
  });

  test('Has correct title', async ({ page }) => {
    await expect(page).toHaveTitle('Analog signal converter - IT Tools');
  });

  test('', async ({ page }) => {

  });
});