import { test, expect } from '@playwright/test';

const ids = ['0', '1', '2', '3', '4', '5', '6a', '6b', '7', '8', '9'];

test('FT16 is the third content and every lesson has a live circuit above its article', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/ja/');
  await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: 'FT16' }).click();
  await expect(page.locator('.ft-roadmap > li')).toHaveCount(11);
  await page.getByRole('link', { name: '段階0：TD4 の回路表示' }).click();
  for (const id of ids) {
    await page.locator('.ft-nav').getByRole('link', { name: new RegExp(`^段階 ${id}:`) }).click();
    await expect(page.locator('.ft-stage-heading h1 > span')).toHaveText(id);
    await expect(page.locator('#circuit [data-module]').first()).toBeVisible();
    await expect(page.locator('#status')).toContainText('クロック 0');
    expect(await page.locator('#circuit .port-value').first().evaluate(el => getComputedStyle(el).fontSize === getComputedStyle(el.parentElement!).fontSize)).toBe(true);
    await expect.poll(() => page.evaluate(() => { const visual = document.getElementById('ft-visualization'); const article = document.getElementById('ft-lesson'); return !!visual && !!article && !!(visual.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING); })).toBe(true);
    await page.locator('.ft-experiment button').first().click();
    await expect(page.locator('#program-select')).toHaveValue(/^mini-/);
    await expect(page.locator('.ft-experiment button').first()).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#speed').selectOption('instant');
    await page.locator('#step-instr').click();
    await expect(page.locator('#play')).toHaveText('▶ 再生');
    await expect(page.locator('#status')).not.toContainText('完了した命令 0');
    await page.locator('#reset').click();
    await expect(page.locator('#status')).toContainText('クロック 0');
    await page.locator('.ft-module-list button').first().click();
    await expect(page.locator('#circuit .module.selected')).toHaveCount(1);
    await expect(page.locator('#inspector')).not.toBeEmpty();
  }
  await page.screenshot({ path: 'test-results/ft16-stage9.png', fullPage: true });
  await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: 'シミュレーター' }).click();
  await expect(page.locator('.circuit-svg')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#circuit')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mini experiments complete, reset fixtures, and edited assembly starts at standard reset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/ja/ft16/9/?program=mini-precise');
  await expect(page.locator('#program-select')).toHaveValue('mini-precise');
  await page.locator('#speed').selectOption('instant');
  await page.locator('#play').click();
  await expect(page.locator('#status')).toContainText('停止');
  await expect(page.locator('#state .regs > div').nth(3)).toContainText('0007');
  await expect(page.locator('#state .regs > div').nth(6)).toContainText('0000');
  await page.locator('#reset').click();
  await expect(page.locator('#state .regs > div').nth(3)).toContainText('0000');
  await page.locator('#editor-box summary').click();
  await page.locator('#source').fill('LI r1, 9\nHALT');
  await page.locator('#apply-source').click();
  await expect(page.locator('#program-select')).toHaveValue('custom');
  await page.locator('#play').click();
  await expect(page.locator('#status')).toContainText('停止');
  await expect(page.locator('#state .regs > div').nth(1)).toContainText('0009');
  await page.reload();
  await expect(page.locator('#source')).toHaveValue('LI r1, 9\nHALT');
  await page.locator('#editor-box summary').click();
  await page.locator('#source').fill('NO_SUCH_INSTRUCTION r1');
  await page.locator('#apply-source').click();
  await expect(page.locator('#asm-errors')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('static FT16 URLs, ISA decoding, language links and mobile layout', async ({ page }) => {
  test.setTimeout(90000);
  for (const locale of ['ja', 'en']) {
    for (const route of ['', 'isa/', ...ids.map(id => `${id}/`)]) {
      const response = await page.goto(`/${locale}/ft16/${route}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  }
  await page.goto('/ja/ft16/');
  await page.getByRole('link', { name: 'ISA の対応表' }).click();
  await expect(page.locator('#isa-3')).toBeInViewport();
  await expect(page.locator('.ft-table-scroll')).toHaveCount(11);
  await page.locator('.ft-encoding select').selectOption('1');
  await expect(page.locator('.ft-encoded-word')).toContainText('0x23FF');
  await page.locator('.ft-encoding select').selectOption('3');
  await expect(page.locator('.ft-encoded-word')).toContainText('0xB203');
  await page.getByRole('link', { name: 'EN', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/ft16\/isa\//);
  await expect(page.getByRole('heading', { name: 'FT16 shared ISA', exact: true })).toBeVisible();
  await expect(page.locator('.ft-page')).toHaveAttribute('lang', 'en');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['', 'isa/', '0/', '6b/', '9/']) {
    await page.goto(`/en/ft16/${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (route === '6b/') await page.screenshot({ path: 'test-results/ft16-mobile.png', fullPage: true });
  }
  await page.goto('/ja/ft16/not-a-stage/');
  await expect(page.locator('#circuit')).toHaveCount(0);
});

test('wire propagation can be paused and zoomed, and comparison stays safe during navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/ja/ft16/0/?program=mini-td4');
  await expect(page.locator('#circuit [data-module="A"]')).toBeVisible();
  await page.locator('#step-event').click();
  await expect(page.locator('#status')).toContainText('伝播中');
  await page.locator('#step-time').click();
  await expect(page.locator('#circuit .waves path').first()).toBeAttached();
  const before = await page.locator('#circuit').getAttribute('viewBox');
  await page.locator('#zoom-in').click();
  expect(await page.locator('#circuit').getAttribute('viewBox')).not.toBe(before);
  await page.locator('#fit').click();
  expect(await page.locator('#circuit').getAttribute('viewBox')).toBe(before);
  await page.locator('#circuit [data-wire]').first().locator('.wire-hit').dispatchEvent('click');
  await expect(page.locator('#circuit .wire.selected')).toHaveCount(1);
  await page.locator('.ft-nav').getByRole('link', { name: /^段階 1:/ }).click();
  await page.locator('#compare-card summary').click();
  await page.locator('#compare').click();
  await expect(page.locator('#comparison table')).toBeVisible({ timeout: 20000 });
  await page.locator('#compare').click();
  await page.locator('.ft-nav').getByRole('link', { name: 'ISA 解説', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'FT16 共通 ISA', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('English FT16 lessons, live controls, and explanations contain no untranslated Japanese', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;
  await page.goto('/en/ft16/');
  await expect(page.getByRole('heading', { name: 'FT16', exact: true })).toBeVisible();
  expect(await page.locator('.ft-page').textContent()).not.toMatch(japanese);
  await expect(page).toHaveTitle('How a CPU works');
  for (const id of ids) {
    await page.locator('.ft-nav').getByRole('link', { name: new RegExp(`^Stage ${id}:`) }).click();
    await expect(page.locator('#circuit [data-module]').first()).toBeVisible();
    await page.locator('.ft-experiment button').first().click();
    await expect(page.locator('#program-select')).toHaveValue(/^mini-/);
    await page.locator('#speed').selectOption('instant');
    await page.getByRole('button', { name: 'One instruction', exact: true }).click();
    await expect(page.locator('#status')).not.toContainText('Completed instructions 0');
    await page.locator('.ft-module-list button').first().click();
    await expect(page.locator('#inspector')).not.toBeEmpty();
    expect(await page.locator('.ft-page').textContent(), `stage ${id}`).not.toMatch(japanese);
    await page.locator('#circuit [data-wire]').first().locator('.wire-hit').dispatchEvent('click');
    await expect(page.locator('#inspector')).toContainText('Wire:');
    expect(await page.locator('#inspector').textContent()).not.toMatch(japanese);
    const attributes = await page.locator('.ft-page [aria-label], .ft-page [title]').evaluateAll(elements => elements.map(el => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`).join('\n'));
    expect(attributes).not.toMatch(japanese);
  }
  await page.locator('.ft-nav').getByRole('link', { name: 'ISA guide', exact: true }).click();
  await expect(page.locator('.ft-table-scroll')).toHaveCount(11);
  expect(await page.locator('.ft-page').textContent()).not.toMatch(japanese);
  await page.locator('.ft-encoding select').selectOption('3');
  await expect(page.locator('.ft-encoded-word')).toContainText('0xB203');
  expect(errors).toEqual([]);
});

test('language switching preserves the experiment URL; English execution and errors work', async ({ page }) => {
  await page.goto('/ja/ft16/9/?program=mini-precise&mode=3#ft-experiments');
  await expect(page.locator('#program-select')).toHaveValue('mini-precise');
  await page.getByRole('link', { name: 'EN', exact: true }).click();
  await expect(page).toHaveURL('/en/ft16/9/?program=mini-precise&mode=3#ft-experiments');
  await expect(page.locator('#program-select')).toHaveValue('mini-precise');
  await expect(page.locator('#opt-mode')).toHaveValue('3');
  await page.locator('#speed').selectOption('instant');
  await page.getByRole('button', { name: '▶ Play', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Halted');
  await expect(page.locator('#state .regs > div').nth(3)).toContainText('0007');
  await expect(page.locator('#state .regs > div').nth(6)).toContainText('0000');
  await page.getByRole('link', { name: '日本語', exact: true }).click();
  await expect(page).toHaveURL('/ja/ft16/9/?program=mini-precise&mode=3#ft-experiments');
  await expect(page.locator('#play')).toHaveText('▶ 再生');
  await page.getByRole('link', { name: 'EN', exact: true }).click();
  await page.locator('#editor-box summary').click();
  await page.locator('#source').fill('LI r1, 9999');
  await page.getByRole('button', { name: 'Assemble and reset', exact: true }).click();
  await expect(page.locator('#asm-errors')).toContainText('Immediate does not fit');
  await page.locator('#source').fill('LI r1, 9\nHALT');
  await page.getByRole('button', { name: 'Assemble and reset', exact: true }).click();
  await expect(page.locator('#program-select')).toHaveValue('custom');
  await page.locator('#speed').selectOption('instant');
  await page.getByRole('button', { name: '▶ Play', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Halted');
  await expect(page.locator('#state .regs > div').nth(1)).toContainText('0009');
});
