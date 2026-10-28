import { test, expect, type Page } from '@playwright/test';

const ids = ['0', '1', '2', '3', '4', '5', '6a', '6b', '7', '8', '9'];

async function stepInstruction(page: Page) {
  if (await page.locator('#step-instr').isVisible()) {
    await page.locator('#step-instr').click();
  } else {
    if (['安定まで', 'Settle'].includes((await page.locator('#step-cycle').textContent())!)) {
      await page.locator('#step-cycle').click();
      await expect(page.locator('#play')).toHaveText(/^▶ (再生|Play)$/);
    }
    await page.locator('#step-cycle').click();
  }
  await expect(page.locator('#play')).toHaveText(/^▶ (再生|Play)$/);
}

async function visibleState(page: Page) {
  return page.evaluate(() => ({
    status: document.querySelector('#status')!.textContent,
    state: document.querySelector('#state')!.innerHTML,
    listing: [...document.querySelectorAll('#listing li')].map(el => ({ address: el.getAttribute('data-addr'), classes: [...el.classList].sort(), content: el.innerHTML })),
    chart: document.querySelector('#chart')!.innerHTML,
    circuit: [...document.querySelectorAll('#circuit [data-view], #circuit [data-wire], #circuit [data-port-value], #circuit [data-pin]')].map(el => el.outerHTML),
  }));
}

test('back restores startup, mid-propagation, capture, and halt without losing the view', async ({ page }) => {
  await page.goto('/ja/ft16/1/');
  await page.locator('#editor-box summary').click();
  await page.locator('#source').fill('LI r1, 1\nLI r2, 2\nHALT');
  await page.locator('#apply-source').click();
  await page.locator('#speed').selectOption('instant');
  await expect(page.locator('#step-back')).toBeDisabled();
  const initial = await visibleState(page);
  await page.locator('#step-time').click();
  const midway = await visibleState(page);
  expect(midway).not.toEqual(initial);
  await page.locator('#step-event').click();
  await page.locator('#step-back').click();
  expect(await visibleState(page)).toEqual(midway);
  await page.locator('#step-back').click();
  expect(await visibleState(page)).toEqual(initial);
  await expect(page.locator('#step-back')).toBeDisabled();
  await page.locator('#step-cycle').click();
  await expect(page.locator('#step-cycle')).toHaveText('1クロック');
  await page.locator('[data-module="RF"]').dispatchEvent('click');
  await page.locator('#zoom-in').click();
  const view = await page.locator('#circuit').getAttribute('viewBox');
  const settled = await visibleState(page);
  await stepInstruction(page);
  const captured = await visibleState(page);
  await page.locator('#step-back').click();
  expect(await visibleState(page)).toEqual(settled);
  await expect(page.locator('#circuit')).toHaveAttribute('viewBox', view!);
  await expect(page.locator('[data-module="RF"]')).toHaveClass(/selected/);
  await stepInstruction(page);
  expect(await visibleState(page)).toEqual(captured);
  await stepInstruction(page);
  const beforeHalt = await visibleState(page);
  await stepInstruction(page);
  await expect(page.locator('#play')).toBeDisabled();
  await page.locator('#step-back').click();
  expect(await visibleState(page)).toEqual(beforeHalt);
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#reset').click();
  await expect(page.locator('#step-back')).toBeDisabled();
});

test('back restores input switches and both fronts of a pulse', async ({ page }) => {
  await page.goto('/ja/ft16/0/');
  await page.locator('#speed').selectOption('instant');
  await page.locator('#step-cycle').click();
  await expect(page.locator('#step-cycle')).toHaveText('1クロック');
  const toggle = page.locator('[data-switch="IN"][data-bit="0"]');
  await toggle.dispatchEvent('click');
  await page.locator('#step-time').click();
  const high = await visibleState(page);
  await toggle.dispatchEvent('click');
  await page.locator('#step-time').click();
  const pulse = await visibleState(page);
  await page.locator('#step-cycle').click();
  await expect(page.locator('#step-cycle')).toHaveText('1クロック');
  await page.locator('#step-back').click();
  expect(await visibleState(page)).toEqual(pulse);
  await page.locator('#step-back').click();
  await page.locator('#step-back').click();
  expect(await visibleState(page)).toEqual(high);
  await expect(page.locator('[data-pin="IN.q"][data-bit="0"]')).toHaveClass('pin high');
  await page.locator('#program-select').selectOption('counter');
  await expect(page.locator('#step-back')).toBeDisabled();
});

test('one back undoes a multi-clock instruction, and playback can rewind by clock', async ({ page }) => {
  for (const stage of ['5', '6b']) {
    await page.goto(`/ja/ft16/${stage}/`);
    await page.locator('#speed').selectOption('instant');
    const initial = await visibleState(page);
    await stepInstruction(page);
    await expect(page.locator('#status')).toContainText('完了した命令 1');
    expect(Number((await page.locator('#status').textContent())!.match(/クロック (\d+)/)![1])).toBeGreaterThan(1);
    await page.locator('#step-back').click();
    expect(await visibleState(page)).toEqual(initial);
    await expect(page.locator('#step-back')).toBeDisabled();
    await page.locator('#speed').selectOption('1000');
    await page.locator('#play').click();
    await expect.poll(async () => Number((await page.locator('#status').textContent())!.match(/クロック (\d+)/)![1])).toBeGreaterThan(3);
    await page.locator('#play').click();
    const cycle = Number((await page.locator('#status').textContent())!.match(/クロック (\d+)/)![1]);
    await page.locator('#step-back').click();
    await expect(page.locator('#play')).toHaveText('▶ 再生');
    await expect(page.locator('#status')).toContainText(`クロック ${cycle - 1} ·`);
    // Time-only exploration at a restored boundary must not schedule a clock in the past.
    for (let i = 0; i < 4; i++) await page.locator('#step-time').click();
    await page.locator('#step-cycle').click();
    await expect(page.locator('#play')).toHaveText('▶ 再生');
  }
});

async function expectPropagating(page: Page, address?: string) {
  const active = page.locator('#listing li.active');
  await expect(active.first()).toHaveClass(/\bpropagating\b/);
  await expect(page.locator('#listing li.waiting')).toHaveCount(0);
  if (address !== undefined) await expect(active).toHaveAttribute('data-addr', address);
}

async function settleSignals(page: Page) {
  for (let i = 0; i < 150; i++) {
    if ((await page.locator('#status').textContent())!.includes('安定')) return;
    await page.locator('#step-event').click();
  }
  throw new Error('Signals did not settle');
}

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
    await expect(page.locator('#program-select')).toHaveValue(/^mini-/);
    await expect(page.locator('.ft-experiment button').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#status')).toContainText('クロック 0');
    await expect(page.locator('#status')).toContainText('伝播中');
    await expectPropagating(page);
    await expect(page.locator('#step-cycle')).toHaveText('安定まで');
    if (['5', '6a', '6b', '7', '9'].includes(id)) await expect(page.locator('#step-instr')).toBeVisible();
    else await expect(page.locator('#step-instr')).toBeHidden();
    // Every bus has its full set of independently colored bit lanes.
    expect(await page.locator('#circuit [data-wire]').evaluateAll(wires => wires.every(w => {
      const bits = [...w.querySelectorAll('[data-wire-bit]')];
      return bits.length === Number(w.getAttribute('data-width')) && bits.every(bit => bit.classList.contains('high') || bit.classList.contains('low'));
    }))).toBe(true);
    await expect(page.locator('.legend')).not.toContainText('変化したバス');
    expect(await page.locator('#circuit .port-value').first().evaluate(el => getComputedStyle(el).fontSize === getComputedStyle(el.parentElement!).fontSize)).toBe(true);
    await expect.poll(() => page.evaluate(() => { const visual = document.getElementById('ft-visualization'); const article = document.getElementById('ft-lesson'); return !!visual && !!article && !!(visual.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING); })).toBe(true);
    await page.locator('.ft-experiment button').first().click();
    await expect(page.locator('#program-select')).toHaveValue(/^mini-/);
    await expect(page.locator('.ft-experiment button').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#status')).toContainText('クロック 0');
    await expect(page.locator('#status')).toContainText('伝播中');
    await expectPropagating(page);
    await page.locator('#speed').selectOption('instant');
    await stepInstruction(page);
    await expect(page.locator('#play')).toHaveText('▶ 再生');
    await expect(page.locator('#status')).not.toContainText('完了した命令 0');
    await page.locator('#reset').click();
    await expect(page.locator('#status')).toContainText('クロック 0');
    await expectPropagating(page);
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

test('bit transitions travel independently, retain pulses, and keep H/L when selected', async ({ page }) => {
  await page.goto('/ja/ft16/0/');
  await expect(page.locator('#status')).toContainText('クロック 0');
  await settleSignals(page);
  const wire = page.locator('#circuit [data-wire="IN.q>MUX.in"]');
  const source = page.locator('#circuit [data-pin="IN.q"][data-bit="0"]');
  const sink = page.locator('#circuit [data-pin="MUX.in"][data-bit="0"]');
  const toggle = page.locator('#circuit [data-switch="IN"][data-bit="0"]');
  await expect(wire.locator('.wire-base.low')).toHaveCount(4);
  await toggle.dispatchEvent('click');
  await expect(source).toHaveClass('pin high');
  await expect(sink).toHaveClass('pin low');
  await page.locator('#step-time').click();
  await expect(wire.locator('.wave.high[data-bit="0"]')).toHaveCount(1);
  await expect(wire.locator('.wave:not([data-bit="0"])')).toHaveCount(0);
  const wave = wire.locator('.wave.high');
  const fraction = Number((await wave.getAttribute('stroke-dasharray'))!.split(' ')[0]);
  expect(fraction).toBeGreaterThan(0);
  expect(fraction).toBeLessThan(1);
  const front = page.locator('#circuit [data-front-wire="IN.q>MUX.in"][data-bit="0"]');
  const position = await front.getAttribute('cx');
  await page.locator('#front-values').uncheck();
  await expect(page.locator('#circuit .front-label')).toHaveCount(0);
  await expect(front).toHaveAttribute('cx', position!);
  await page.locator('#front-values').check();
  await expect(page.locator('#circuit .front-label').first()).toBeAttached();

  // A falling edge follows the rising edge while the receiver is still L.
  await toggle.dispatchEvent('click');
  await page.locator('#step-time').click();
  await expect(wire.locator('.wave.high')).toHaveCount(1);
  await expect(wire.locator('.wave.low')).toHaveCount(1);
  await expect(source).toHaveClass('pin low');
  await expect(sink).toHaveClass('pin low');
  const color = await wave.evaluate(el => getComputedStyle(el).stroke);
  await wire.locator('.wire-hit').dispatchEvent('click');
  await expect(wire).toHaveClass(/selected/);
  expect(await wave.evaluate(el => getComputedStyle(el).stroke)).toBe(color);
  await expect(page.locator('#inspector .signal-bit')).toHaveCount(8);
  // Arrival of H followed by L must remain visible even though the source
  // has already returned to L (a pulse must not be discarded).
  await page.locator('#step-event').click();
  await expect(sink).toHaveClass('pin high');
  await expect(wire.locator('.wire-base.high')).toHaveCount(1);
  await expect(wire.locator('.wave.high')).toHaveCount(0);
  await expect(wire.locator('.wave.low')).toHaveCount(1);
  await page.locator('#step-event').click();
  await expect(sink).toHaveClass('pin low');
  await expect(wire.locator('.wire-base.low')).toHaveCount(4);
  await expect(wire.locator('.wave')).toHaveCount(0);
  await expect(page.locator('#status')).toContainText('安定');
  await page.locator('#reset').click();
  await expect(wire.locator('.wire-base.low')).toHaveCount(4);
});

test('assembly follows the new PC with lighter propagation styling, including a jump', async ({ page }) => {
  await page.goto('/ja/ft16/0/');
  await page.locator('#editor-box summary').click();
  await page.locator('#source').fill('MOV A, 1\nJMP 0');
  await page.locator('#apply-source').click();
  await settleSignals(page);
  const current = page.locator('#listing li.active');
  await expect(current).toHaveAttribute('data-addr', '0');
  await expect(current.locator('.tag')).toHaveText('取り込み待ち');
  await expect(current).toHaveClass(/\bwaiting\b/);
  const waitingBg = await current.evaluate(el => getComputedStyle(el).backgroundColor);
  const waitingTagBg = await current.locator('.tag').evaluate(el => getComputedStyle(el).backgroundColor);
  await page.locator('#listing').screenshot({ path: 'test-results/ft16-listing-waiting.png' });
  await page.locator('#step-event').click();
  await expect(page.locator('#state .regs > div').nth(3)).toContainText('0001');
  await expect(page.locator('#status')).toContainText('伝播中');
  await expectPropagating(page, '1');
  await expect(current.locator('.tag')).toHaveText('伝播中');
  expect(await current.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(waitingBg);
  expect(await current.locator('.tag').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(waitingTagBg);
  await page.locator('#listing').screenshot({ path: 'test-results/ft16-listing-propagating.png' });
  // Inspect each arrival, including the final arrival with no new output.
  for (let i = 0; i < 100; i++) {
    await page.locator('#step-event').click();
    if ((await page.locator('#status').textContent())!.includes('安定')) break;
    await expectPropagating(page, '1');
    expect(i).toBeLessThan(99);
  }
  await expect(current).toHaveAttribute('data-addr', '1');
  await expect(current.locator('.tag')).toHaveText('取り込み待ち');
  expect(await current.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(waitingBg);
  await page.locator('#step-event').click();
  await expect(page.locator('#state .regs > div').nth(3)).toContainText('0000');
  await expectPropagating(page, '0');
  await page.locator('#speed').selectOption('instant');
  await page.locator('#step-cycle').click();
  await expect(page.locator('#status')).toContainText('安定');
  await expect(current).toHaveAttribute('data-addr', '0');
});

for (const speed of ['40', 'instant']) test(`startup changes from propagation to capture-wait before the first clock (${speed})`, async ({ page }) => {
  await page.goto('/ja/ft16/1/');
  await page.locator('#editor-box summary').click();
  await page.locator('#source').fill('LI r1, 1\nLI r2, 2\nHALT');
  await page.locator('#apply-source').click();
  await page.locator('#speed').selectOption(speed);
  const r1 = page.locator('[data-view="RF"] tspan').filter({ hasText: /^r1 / });
  const step = async () => {
    await page.locator('#step-cycle').click();
    await expect(page.locator('#play')).toHaveText('▶ 再生');
    await expect(page.locator('#status')).toContainText('安定');
  };

  await expect(page.locator('#status')).toContainText('クロック 0 · 完了した命令 0');
  await expect(page.locator('#status')).toContainText('伝播中');
  await expect(page.locator('[data-port-value="RF.wd"]')).toHaveText('0x0000');
  await expect(r1).toHaveText('r1 0000');
  await expectPropagating(page);

  await step();
  await expect(page.locator('#status')).toContainText('クロック 0 · 完了した命令 0');
  await expect(page.locator('[data-port-value="RF.wd"]')).toHaveText('0x0001');
  await expect(r1).toHaveText('r1 0000');
  await expect(page.locator('#listing li.active')).toHaveAttribute('data-addr', '0');

  await step();
  await expect(page.locator('#status')).toContainText('クロック 1 · 完了した命令 1');
  await expect(r1).toHaveText('r1 0001');
  await expect(page.locator('#listing li.active')).toHaveAttribute('data-addr', '1');

  // Reset restores the propagation annotation; partial startup still stops before the edge.
  await page.locator('#reset').click();
  await expect(page.locator('#status')).toContainText('クロック 0 · 完了した命令 0');
  await expectPropagating(page);
  await page.locator('#step-time').click();
  await expectPropagating(page);
  await step();
  await expect(page.locator('#status')).toContainText('クロック 0 · 完了した命令 0');
  await expect(page.locator('#listing li.active')).toHaveAttribute('data-addr', '0');
  await expect(r1).toHaveText('r1 0000');

  // A step during propagation still finishes that cycle without an extra edge.
  await page.locator('#step-event').click();
  await expect(page.locator('#status')).toContainText('伝播中');
  await step();
  await expect(page.locator('#status')).toContainText('クロック 1 · 完了した命令 1');

  // Single-cycle stages use the clock button to retire an instruction.
  await page.locator('#reset').click();
  await expect(page.locator('#step-instr')).toBeHidden();
  await stepInstruction(page);
  await expect(page.locator('#play')).toHaveText('▶ 再生');
  await expect(page.locator('#status')).toContainText('クロック 1 · 完了した命令 1');
  await expect(r1).toHaveText('r1 0001');
});

test('module numbers follow arrivals and clock capture from the very first instruction', async ({ page }) => {
  await page.goto('/ja/ft16/1/');
  await page.locator('#editor-box summary').click();
  await page.locator('#source').fill('LI r1, 1\nLI r2, 2\nHALT');
  await page.locator('#apply-source').click();
  const r1 = page.locator('[data-view="RF"] tspan').filter({ hasText: /^r1 / });
  const r2 = page.locator('[data-view="RF"] tspan').filter({ hasText: /^r2 / });
  const input = page.locator('[data-port-value="RF.wd"]');
  const memory = page.locator('[data-view="MEM"] .on.code');
  await expect(page.locator('#status')).toContainText('クロック 0 · 完了した命令 0');
  await expect(r1).toHaveText('r1 0000');
  await expect(input).toHaveText('0x0000');
  for (let i = 0; i < 150; i++) {
    await expect(r1).toHaveText('r1 0000');
    if ((await page.locator('#status').textContent())!.includes('安定')) break;
    await expectPropagating(page);
    await page.locator('#step-event').click();
    expect(i).toBeLessThan(149);
  }
  await expect(page.locator('#listing li.active')).toHaveAttribute('data-addr', '0');
  await expect(input).toHaveText('0x0001');
  await expect(page.locator('#signal-phase')).toContainText('入力が安定');
  await expect(memory).toContainText(/^000 /);
  // Clock captures already-arrived data. The new PC has not reached MEMORY.
  await page.locator('#step-event').click();
  await expect(r1).toHaveText('r1 0001');
  await expect(r2).toHaveText('r2 0000');
  await expect(memory).toContainText(/^000 /);
  await expect(page.locator('[data-port-value="MEM.iaddr"]')).toHaveText('0x0000');
  await expect(page.locator('#signal-phase')).toContainText('クロック 1');
  // The PC address wire is the first arrival in this circuit.
  await page.locator('#step-event').click();
  await expect(page.locator('[data-port-value="MEM.iaddr"]')).toHaveText('0x0001');
  await expect(memory).toContainText(/^001 /);
  await expectPropagating(page);
  await settleSignals(page);
  await expect(page.locator('#listing li.active')).toHaveAttribute('data-addr', '1');
  await expect(page.locator('#listing .tag')).toHaveText('取り込み待ち');
  await expect(input).toHaveText('0x0002');
  await expect(r2).toHaveText('r2 0000');
  await page.locator('#step-event').click();
  await expect(r2).toHaveText('r2 0002');
  await expectPropagating(page);
  await page.locator('#reset').click();
  await expect(page.locator('#status')).toContainText('伝播中');
  await expectPropagating(page);
  await expect(input).toHaveText('0x0000');
  await expect(r1).toHaveText('r1 0000');
  await expect(r2).toHaveText('r2 0000');
});

test('completed HALT has no capture-wait annotation and reset restores startup', async ({ page }) => {
  await page.goto('/en/ft16/1/');
  await page.locator('#editor-box summary').click();
  await page.locator('#source').fill('LI r1, 1\nHALT\nLI r2, 9');
  await page.locator('#apply-source').click();
  await page.locator('#speed').selectOption('instant');
  await page.locator('#play').click();
  await expect(page.locator('#status')).toContainText('Halted');
  await expect(page.locator('#listing li.active')).toHaveCount(0);
  await expect(page.locator('#listing .tag')).toHaveCount(0);
  await page.locator('#reset').click();
  await expectPropagating(page, '0');
  await expect(page.locator('#listing .tag')).toHaveText('Propagating');
  await page.locator('#step-cycle').click();
  await expect(page.locator('#play')).toHaveText('▶ Play');
  await expect(page.locator('#listing li.active')).toHaveAttribute('data-addr', '0');
  await expect(page.locator('#listing .tag')).toHaveText('Awaiting capture');
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
  await page.locator('#program-select').selectOption('mul');
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
    await expect(page.locator('.ft-stage-heading h1 > span')).toHaveText(id);
    await expect(page.locator('#circuit [data-module]').first()).toBeVisible();
    await expect(page.locator('#program-select')).toHaveValue(/^mini-/);
    await expect(page.locator('.ft-experiment button').first()).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.ft-experiment button').first().click();
    await expect(page.locator('#program-select')).toHaveValue(/^mini-/);
    await page.locator('#speed').selectOption('instant');
    await stepInstruction(page);
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
