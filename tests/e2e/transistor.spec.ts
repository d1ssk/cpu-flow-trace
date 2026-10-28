import { test, expect } from '@playwright/test';

test('repeated pointer actions keep working after idle and while signals travel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/en/');
  const lab = page.getByRole('complementary', { name: 'Transistor playground' });
  const gate = lab.getByRole('switch', { name: 'Gate H/L' });
  const source = lab.getByRole('switch', { name: 'Source H/L' });
  for (let i = 0; i < 4; i++) {
    await gate.click();
    await expect(lab.getByTestId('transistor-output')).toHaveText('H');
    await source.click();
    await expect(lab.getByTestId('transistor-output')).toHaveText('L');
    await gate.click();
    await expect(lab.getByTestId('transistor-output')).toHaveText('Z');
    await source.click();
    await expect(lab.getByTestId('wire-transition')).toHaveCount(0);
  }
  await gate.click();
  await gate.click();
  await gate.click();
  await expect(lab.getByTestId('transistor-output')).toHaveText('H');
  expect(errors).toEqual([]);
});

test('transistor switches propagate independently, pause and step, and support keyboard input', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/en/?view=overview');
  await expect(page.getByRole('button', { name: 'Step one instruction', exact: true })).toBeEnabled();
  const lab = page.getByRole('complementary', { name: 'Transistor playground' });
  await lab.getByRole('button', { name: 'Pause signals' }).click();
  await lab.getByRole('switch', { name: 'Gate H/L' }).click();
  await expect(lab.getByTestId('transistor-channel')).toHaveText('OFF');
  await lab.getByRole('button', { name: 'Advance transistor signals by 0.1 s' }).click();
  await expect(lab.getByTestId('wire-transition')).toHaveCount(1);
  await expect(lab.getByTestId('transistor-output')).toHaveText('Z');
  await lab.getByRole('button', { name: 'Advance transistor signals by 0.1 s' }).click();
  await expect(lab.getByTestId('transistor-channel')).toHaveText('ON');
  await expect(lab.getByTestId('transistor-output')).toHaveText('Z');
  for (let i = 0; i < 2; i++) await lab.getByRole('button', { name: 'Advance transistor signals by 0.1 s' }).click();
  await expect(lab.getByTestId('transistor-output')).toHaveText('H');
  await lab.getByRole('button', { name: 'Resume signals' }).click();
  await lab.getByRole('switch', { name: 'Source H/L' }).focus();
  await page.keyboard.press('Space');
  await expect(lab.getByTestId('transistor-output')).toHaveText('L');
  await lab.getByRole('button', { name: 'pMOS', exact: true }).click();
  await expect(lab.getByTestId('transistor-output')).toHaveText('Z');
  await lab.getByRole('switch', { name: 'Gate H/L' }).focus();
  await page.keyboard.press('Enter');
  await expect(lab.getByTestId('transistor-output')).toHaveText('L');
  await expect(page.getByTestId('cycle-count')).toHaveText('0 instructions completed');
  await expect(page.getByTestId('input-word')).toHaveText('0000');
  await expect(page.getByTestId('output-word')).toHaveText('0000');
  await expect(page.getByLabel('Observation time', { exact: true })).toHaveText('0.00 s');
  expect(errors).toEqual([]);
});

test('Japanese playground fits next to the readout on desktop and within mobile', async ({ page }) => {
  await page.goto('/ja/?view=overview');
  const lab = page.getByRole('complementary', { name: 'トランジスタ実験' });
  await expect(lab).toBeVisible();
  const registers = await page.locator('.td4-registers').boundingBox();
  const panel = await lab.boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(registers!.x + registers!.width);
  expect(panel!.height).toBeLessThanOrEqual(94);
  const readoutHeight = await page.locator('.td4-canvas-readout').evaluate(el => el.getBoundingClientRect().height);
  // Removing the playground restores the pre-feature readout layout. Keep the
  // desktop height within a few pixels of that layout, including register wrap.
  await lab.evaluate(el => { el.style.display = 'none'; });
  const originalHeight = await page.locator('.td4-canvas-readout').evaluate(el => el.getBoundingClientRect().height);
  expect(readoutHeight - originalHeight).toBeLessThanOrEqual(10);
  await page.locator('.transistor-playground').evaluate(el => { el.style.removeProperty('display'); });
  await lab.screenshot({ path: 'test-results/transistor-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(lab.getByRole('switch', { name: 'ゲート H/L' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await lab.getByRole('switch', { name: 'ゲート H/L' }).click();
  await expect(lab.getByTestId('transistor-output')).toHaveText('H');
  await lab.screenshot({ path: 'test-results/transistor-mobile.png' });
});
