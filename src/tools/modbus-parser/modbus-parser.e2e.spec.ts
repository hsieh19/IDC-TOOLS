import { expect, test } from '@playwright/test';

test.describe('Tool - Modbus parser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/modbus-parser');
  });

  test('Has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Modbus 协议解析器/);
  });

  test('Can load and parse default example', async ({ page }) => {
    // 检查输入框是否不为空 (有默认值)
    const textarea = page.locator('textarea');
    await expect(textarea).not.toHaveValue('');

    // 检查是否渲染了拆解切片
    const byteChip = page.locator('.byte-chip').first();
    await expect(byteChip).toBeVisible();

    // 检查是否展示了多格式深度转换表
    const table = page.locator('.data-table');
    await expect(table).toBeVisible();
  });
});
