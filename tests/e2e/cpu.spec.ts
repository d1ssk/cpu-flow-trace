import { test, expect, type Page } from '@playwright/test';
const ready = (page: Page) => expect(page.getByRole('button', { name: 'Step one instruction', exact: true })).toBeEnabled({ timeout: 25000 });
async function home(page: Page, query = '') {
  await page.goto(`/en/${query}`); await ready(page);
}
async function cycle(page: Page) {
  await ready(page); await page.getByRole('button', { name: 'Step one instruction', exact: true }).click(); await ready(page);
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  // Attach collected errors to the page so they can be checked even if a test
  // navigates through several independently mounted circuit experiments.
  (page as Page & { cpuErrors: string[] }).cpuErrors = errors;
});
test.afterEach(async ({ page }) => { expect((page as Page & { cpuErrors: string[] }).cpuErrors).toEqual([]); });

test('home defaults to MOS with power, loads only that construction, and exposes all six programs', async ({ page }) => {
  const chunks: string[] = [];
  page.on('request', req => {
    if (/\/assets\/|\/src\/circuits\/td4\/generated\//.test(req.url())) chunks.push(req.url());
  });
  await home(page);
  await expect(page.getByRole('complementary', { name: 'Transistors' })).toBeVisible();
  await expect(page.locator('.brand')).toHaveCSS('font-size', '28px');
  await expect(page.locator('[data-module="IN"] .module-box')).toHaveCSS('fill', 'rgb(252, 252, 250)');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('position', 'absolute');
  await expect(page.getByLabel('Choose a sample')).toHaveValue('counter');
  await expect(page.getByLabel('Choose a sample').locator('option:not(:disabled)')).toHaveCount(6);
  await expect(page.getByLabel('Speed', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Speed', { exact: true }).locator('option')).toHaveText(['0.125×', '0.25×', '0.5×', '1×', '2×', '4×']);
  await expect(page.locator('[data-detail-root]')).toHaveCount(9);
  await expect(page.locator('[data-mos]')).toHaveCount(1244);
  await expect(page.getByLabel('Power wires')).toBeChecked();
  await expect(page.locator('[data-power-rail]')).toHaveCount(2);
  expect(chunks.some(url => /-(nand|module)(-|\.json)/.test(url))).toBe(false);
  expect(chunks.some(url => /classic|wide|workbench|dense-layout/.test(url))).toBe(false);
  expect(await page.locator('[data-detail-wire] .wire-base').first().evaluate(el => getComputedStyle(el).strokeWidth)).toBe('1.3px');
  await expect(page.getByTestId('cycle-count')).toHaveText('0 instructions completed');
  await page.screenshot({ path: 'test-results/home-mos-en.png', fullPage: true });
  for (const [id, length] of [['counter', 5], ['led-blink', 10], ['input-output', 3], ['double-input', 8], ['half-input', 8], ['ramen-timer', 16]] as const) {
    await page.getByLabel('Choose a sample').selectOption(id); await ready(page);
    await expect(page.locator('.assembly-table tbody tr')).toHaveCount(length);
    await expect(page.locator('[data-rom-word]').first()).toHaveAttribute('aria-label', /00: [01]{8}/);
  }
  await page.getByRole('tab', { name: 'C-like', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('uint4_t a = 0');
  await page.getByRole('link', { name: '日本語', exact: true }).click();
  await expect(page.getByLabel('サンプルを選ぶ')).toHaveValue('ramen-timer');
  await expect(page.getByRole('tabpanel')).toContainText('uint4_t a = 0');
  await page.locator('.instruction-reference summary').click();
  await expect(page.locator('.instruction-entry')).toHaveCount(12);
});

test('paused wire transitions, power visibility, zoom and language preserve time and state', async ({ page }) => {
  await home(page);
  await page.locator('.td4-signal-controls summary').click();
  await page.getByRole('button', { name: 'Toggle input I0', exact: true }).focus(); await page.keyboard.press('Space');
  await expect(page.getByTestId('input-word')).toHaveText('0001');
  await page.getByRole('button', { name: '+0.1 s', exact: true }).click();
  expect(await page.locator('.wave-layers path').count()).toBeGreaterThan(0);
  const wire = page.locator('[data-wire="IN.q>MUX.input:0"]'); await wire.focus(); await page.keyboard.press('Enter');
  await expect(page.getByTestId('inspector')).toContainText('Source H');
  await expect(page.getByTestId('inspector')).toContainText('Arrived L');
  const time = await page.getByLabel('Observation time', { exact: true }).textContent();
  const transitions = await page.locator('.wave-layers').evaluateAll(es => es.map(el => el.innerHTML));
  for (const checked of [false, true]) {
    await page.getByLabel('Power wires').setChecked(checked);
    await expect(page.locator('[data-power-rail]')).toHaveCount(checked ? 2 : 0);
    await expect(page.getByLabel('Observation time', { exact: true })).toHaveText(time!);
    expect(await page.locator('.wave-layers').evaluateAll(es => es.map(el => el.innerHTML))).toEqual(transitions);
  }
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveText('150%');
  await page.getByRole('link', { name: '日本語', exact: true }).click();
  await expect(page.getByLabel('観察時間', { exact: true })).toHaveText(time!);
  await expect(page.getByTestId('input-word')).toHaveText('0001');
  await expect(page.getByLabel('表示倍率')).toHaveText('150%');
});

test('all constructions execute, switch with held state, and blocks annotate exactly the CPU', async ({ page }) => {
  test.setTimeout(90000);
  await home(page, '?program=led-blink');
  await page.getByLabel('Speed', { exact: true }).selectOption('4');
  await cycle(page); await expect(page.getByTestId('output-word')).toHaveText('0011');
  for (const view of ['module', 'nand', 'overview', 'mos']) {
    await page.locator(`[data-view="${view}"]`).click(); await ready(page);
    await expect(page.locator(`[data-view="${view}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('output-word')).toHaveText('0011');
    await expect(page.getByTestId('cycle-count')).toHaveText('1 instructions completed');
    await expect(page.getByLabel('Observation time', { exact: true })).toHaveText('0.00 s');
    await expect(page.locator('.cpu-boundary')).toHaveCount(view === 'overview' ? 1 : 0);
    if (view === 'overview') {
      await expect(page.locator('.cpu-annotation')).toHaveText('CPU');
      expect(await page.locator('.cpu-boundary path').evaluate(el => getComputedStyle(el).strokeDasharray)).toBe('6px, 5px');
      const containment = await page.locator('.td4-svg').evaluate(svg => {
        const path = svg.querySelector('.cpu-boundary path') as SVGGeometryElement;
        return Array.from(svg.querySelectorAll<SVGGElement>('[data-module]')).map(el => {
          const box = el.getBBox();
          return { id: el.dataset.module, inside: path.isPointInFill(new DOMPoint(box.x + box.width / 2, box.y + box.height / 2)) };
        });
      });
      for (const entry of containment) expect(entry.inside).toBe(!['IN', 'ROM', 'OUT'].includes(entry.id!));
      await page.screenshot({ path: 'test-results/home-blocks-en.png', fullPage: true });
    }
  }
  await cycle(page); await expect(page.getByTestId('output-word')).toHaveText('0110');
  await page.getByRole('button', { name: 'Reset', exact: true }).click(); await ready(page);
  await expect(page.getByTestId('output-word')).toHaveText('0000');
  await expect(page.getByLabel('Choose a sample')).toHaveValue('led-blink');
});

test('input program and continuous execution are connected to CPU and ROM, including fetch delay', async ({ page }) => {
  test.setTimeout(60000);
  await home(page, '?view=overview&program=input-output');
  await page.getByLabel('Speed', { exact: true }).selectOption('4');
  for (const bit of [1, 3]) await page.getByRole('button', { name: `Toggle input I${bit}`, exact: true }).click();
  await ready(page); await cycle(page); await cycle(page);
  await expect(page.getByTestId('output-word')).toHaveText('1010');
  await expect(page.locator('.assembly-table tr[aria-current]')).toContainText('02');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByTestId('cycle-count')).not.toHaveText('2 instructions completed');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const frozenTime = await page.getByLabel('Observation time', { exact: true }).textContent();
  await page.waitForTimeout(250);
  await expect(page.getByLabel('Observation time', { exact: true })).toHaveText(frozenTime!);
  await cycle(page);
  const count = await page.getByTestId('cycle-count').textContent();
  await page.locator('.td4-signal-controls summary').click();
  await page.getByRole('button', { name: '+0.1 s', exact: true }).click();
  await expect(page.getByTestId('cycle-count')).toHaveText(count!);
  await cycle(page);
  // Expose the different instants of PC capture and ROM address arrival.
  await page.getByRole('button', { name: 'Step one instruction', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  let differs = false;
  for (let i = 0; i < 100; i++) {
    if (!await page.getByRole('button', { name: 'Next signal change', exact: true }).isEnabled()) break;
    await page.getByRole('button', { name: 'Next signal change', exact: true }).click();
    const pc = await page.locator('.assembly-table tr[aria-current] td').first().textContent();
    const rom = await page.locator('[data-rom-word][aria-current]').getAttribute('data-rom-word');
    if (parseInt(pc!, 16) !== Number(rom)) { differs = true; break; }
  }
  expect(differs).toBe(true);
});

test('arithmetic samples read input, display their result and reset for another calculation', async ({ page }) => {
  test.setTimeout(150000);
  for (const [id, input, output] of [['double-input', 9, '0010'], ['half-input', 7, '0011']] as const) {
    await home(page, `?view=overview&program=${id}`);
    await page.getByLabel('Speed', { exact: true }).selectOption('4');
    for (let bit = 0; bit < 4; bit++) if ((input >> bit) & 1) {
      await page.getByRole('button', { name: `Toggle input I${bit}`, exact: true }).click();
    }
    await ready(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    // These loops need dozens of instructions, each with visible wire propagation.
    await expect(page.getByTestId('output-word')).toHaveText(output, { timeout: 90000 });
    await expect(page.locator('.assembly-table tr[aria-current] td').first()).toHaveText('07');
    await page.getByRole('button', { name: 'Pause', exact: true }).click(); await ready(page);
    await page.getByRole('button', { name: 'Reset', exact: true }).click(); await ready(page);
    await expect(page.getByTestId('input-word')).toHaveText('0000');
    await expect(page.getByTestId('output-word')).toHaveText('0000');
    await expect(page.getByLabel('Choose a sample')).toHaveValue(id);
  }
});

test('assembly editing validates, leaves drafts unapplied, executes the compiled ROM and persists it', async ({ page }) => {
  test.setTimeout(60000);
  await home(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByLabel('Assembly source');
  await expect(editor).toContainText('MOV A, 0');
  await editor.fill('; test\nMOV A, 0xf\nOUT 16');
  await page.getByRole('button', { name: 'Apply and reset', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Line 3');
  await expect(page.locator('[data-rom-word]').first()).toHaveAttribute('aria-label', /00110000/);
  await editor.fill('OUT 8\nJMP 0');
  await expect(page.locator('[data-rom-word]').first()).toHaveAttribute('aria-label', /00110000/);
  await page.getByRole('button', { name: 'Apply and reset', exact: true }).click(); await ready(page);
  await expect(page.getByLabel('Choose a sample')).toHaveValue('custom');
  await expect(page.locator('[data-rom-word]').first()).toHaveAttribute('aria-label', /10111000/);
  await expect(page.locator('.assembly-table tbody tr')).toHaveCount(2);
  await page.getByLabel('Speed', { exact: true }).selectOption('4');
  await cycle(page); await expect(page.getByTestId('output-word')).toHaveText('1000');
  await page.getByRole('link', { name: '日本語', exact: true }).click();
  await expect(page.getByTestId('output-word')).toHaveText('1000');
  await expect(page.getByLabel('サンプルを選ぶ')).toHaveValue('custom');
  await page.reload(); await expect(page.getByRole('button', { name: '1命令進める', exact: true })).toBeEnabled();
  await expect(page.locator('.assembly-table tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: '編集する', exact: true }).click();
  await expect(page.getByLabel('アセンブリのソース')).toHaveValue('OUT 8\nJMP 0');
});

test('mobile starts with circuit first, program can be expanded and zoom stays within local scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await home(page);
  await expect(page.locator('#home-program')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect(await page.getByTestId('circuit-scroll').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Fit circuit', exact: true }).click();
  await page.getByRole('button', { name: 'Show program', exact: true }).click();
  await expect(page.getByLabel('Choose a sample')).toBeVisible();
  await page.getByLabel('Choose a sample').selectOption('input-output'); await ready(page);
  const y = await page.locator('.td4-circuit').boundingBox(); const program = await page.locator('.td4-program').boundingBox();
  expect(program!.y).toBeGreaterThan(y!.y);
  await page.getByRole('button', { name: 'Collapse program', exact: true }).click();
  await page.screenshot({ path: 'test-results/home-mos-mobile.png', fullPage: true });
});

test('scrolling over the circuit scrolls the page and chains at the edge of a zoomed circuit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await home(page);
  const canvas = page.getByTestId('circuit-scroll');
  await canvas.hover();
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 250);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await canvas.evaluate(el => { el.scrollTop = 0; });
  await canvas.hover();
  await page.mouse.wheel(0, 120);
  await expect.poll(() => canvas.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await canvas.evaluate(el => { el.scrollTop = el.scrollHeight; });
  const atEdge = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(atEdge);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('nine module experiments support all four views, inspection, inputs and deep links', async ({ page }) => {
  test.setTimeout(180000);
  for (const id of ['ALU', 'MUX', 'DEC', 'NEXT', 'A', 'B', 'PC', 'R', 'CF']) {
    await page.goto(`/en/modules/${id}/`);
    await expect(page.locator('[data-mos]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
    for (const view of ['module', 'nand', 'mos']) {
      await page.locator(`[data-view="${view}"]`).click();
      await expect(page.locator(`[data-view="${view}"]`)).toBeEnabled();
      await expect(page.locator(`[data-view="${view}"]`)).toHaveAttribute('aria-pressed', 'true');
      const target = page.locator(view === 'mos' ? '[data-mos]' : view === 'nand' ? '[data-gate]' : '[data-part-module]').first();
      await target.focus(); await page.keyboard.press('Enter');
      await expect(page.getByTestId('inspector')).not.toContainText('Toggle INPUT');
    }
    await page.getByRole('button', { name: 'Pause', exact: true }).count().then(async count => { if (count) await page.getByRole('button', { name: 'Pause', exact: true }).click(); });
    const field = page.locator('.td4-detail-inputs input').first(); await field.fill('1');
    await page.getByRole('button', { name: '+0.01 s', exact: true }).click();
    const time = await page.getByLabel('Observation time', { exact: true }).textContent();
    await page.getByLabel('Power wires').uncheck();
    await expect(page.locator('[data-supply-mode]').first()).toHaveAttribute('data-supply-mode', 'short');
    await expect(page.getByLabel('Observation time', { exact: true })).toHaveText(time!);
    await expect(field).toHaveValue('1');
    await page.reload(); await expect(page.locator('[data-supply-mode]').first()).toHaveAttribute('data-supply-mode', 'short');
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/module-mobile.png', fullPage: true });
});

test('home selection opens the corresponding independent module experiment', async ({ page }) => {
  await home(page, '?view=overview&program=ramen-timer');
  await page.locator('[data-module="ALU"]').focus(); await page.keyboard.press('Enter');
  await page.getByRole('link', { name: 'Explore this module', exact: false }).click();
  await expect(page.locator('h1')).toHaveText('ALU · 4 bit ADD');
  await expect(page.locator('[data-part-module]').first()).toBeVisible();
  await page.getByRole('link', { name: 'Back to the CPU', exact: false }).click(); await ready(page);
  await expect(page.getByLabel('Choose a sample')).toHaveValue('ramen-timer');
});

test('DFF experiment captures on the clock and retains its input and held value across constructions', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/en/modules/A/?view=module');
  await expect(page.getByRole('spinbutton', { name: 'D', exact: true })).toBeEnabled();
  await page.getByLabel('Speed', { exact: true }).selectOption('4');
  await page.getByRole('spinbutton', { name: 'EN', exact: true }).fill('1');
  await page.getByRole('spinbutton', { name: 'D', exact: true }).fill('9');
  await expect(page.getByLabel('Outputs', { exact: true })).toContainText('Stable', { timeout: 15000 });
  await expect(page.getByLabel('Outputs', { exact: true })).toContainText('Q 0000');
  const latch = (id: string) => page.locator(`[data-latch-output="${id}.q"]`);
  await expect(latch('B0.M')).toHaveAttribute('data-held-value', '1');
  await expect(latch('B0.M')).toHaveCSS('fill', 'rgb(247, 238, 234)');
  await expect(latch('B0.S')).toHaveAttribute('data-held-value', '0');
  await expect(latch('B0.S')).toHaveCSS('fill', 'rgb(252, 252, 250)');
  await expect(latch('B1.M')).toHaveAttribute('data-held-value', '0');
  await page.getByRole('spinbutton', { name: 'CLK', exact: true }).fill('1');
  await expect(page.getByLabel('Outputs', { exact: true })).toContainText('Q 1001', { timeout: 15000 });
  await expect(latch('B0.S')).toHaveCSS('fill', 'rgb(247, 238, 234)');
  await page.getByRole('spinbutton', { name: 'D', exact: true }).fill('6');
  await expect(page.getByLabel('Outputs', { exact: true })).toContainText('Stable', { timeout: 15000 });
  await expect(latch('B0.M')).toHaveAttribute('data-held-value', '1');
  await expect(latch('B0.S')).toHaveAttribute('data-held-value', '1');
  await page.getByRole('spinbutton', { name: 'CLK', exact: true }).fill('0');
  await expect(page.getByLabel('Outputs', { exact: true })).toContainText('Stable', { timeout: 15000 });
  await expect(latch('B0.M')).toHaveAttribute('data-held-value', '0');
  await expect(latch('B0.M')).toHaveCSS('fill', 'rgb(252, 252, 250)');
  await expect(latch('B0.S')).toHaveAttribute('data-held-value', '1');
  await expect(latch('B1.M')).toHaveAttribute('data-held-value', '1');
  await expect(latch('B1.S')).toHaveAttribute('data-held-value', '0');
  await page.screenshot({ path: 'test-results/latch-held-values.png', fullPage: true });
  for (const view of ['nand', 'mos']) {
    await page.locator(`[data-view="${view}"]`).click();
    await expect(page.getByRole('spinbutton', { name: 'D', exact: true })).toBeEnabled();
    await expect(page.getByRole('spinbutton', { name: 'D', exact: true })).toHaveValue('6');
    await expect(page.getByLabel('Outputs', { exact: true })).toContainText('Q 1001');
    await expect(page.getByLabel('Observation time', { exact: true })).toHaveText('0.000 s');
  }
});

test('construction controls stay in place when the power checkbox appears or disappears', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    await home(page);
    const positions = () => page.locator('.td4-views button').evaluateAll(buttons => buttons.map(button => {
      const { x, y, width, height } = button.getBoundingClientRect(); return { x, y, width, height };
    }));
    const initial = await positions();
    const controls = await page.locator('.td4-playback').boundingBox();
    for (const view of ['module', 'nand', 'overview', 'mos']) {
      await page.locator(`[data-view="${view}"]`).click(); await ready(page);
      expect(await positions()).toEqual(initial);
      expect(await page.locator('.td4-playback').boundingBox()).toEqual(controls);
      if (view === 'mos') await expect(page.getByLabel('Power wires')).toBeVisible();
      else await expect(page.getByLabel('Power wires')).toBeHidden();
    }
  }
});
