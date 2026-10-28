import { createTranslator, localizeData } from '../i18n/index.js';
/* Workbench page: stage and program selection, playback, inspection.
 * Stage 0 runs the TD4 instruction set; stages 1–9 run FT16. */

import { stages, stageById, buildStage, programFits, isBuilt } from '../stages/index.js';
import { allPrograms as samples } from '../programs/index.js';
import { experiments } from '../experiments.js';
import { AssemblyError } from '../isa/assembler.js';
import { disassemble } from '../isa/disassembler.js';
import { CAUSE_NAMES, PAGE_BITS, hex } from '../isa/spec.js';
import { disassembleTd4, Td4AssemblyError } from '../td4/isa.js';
import { Simulator } from '../sim/simulator.js';
import { assembleFor, cpuStopped, switchModule } from '../sim/run.js';
import { MODE_NAMES } from '../sim/modules-pipeline.js';
import { formatValue, flagsText, bin } from '../sim/format.js';
import { CircuitView } from './circuit-view.js';
import { inspectorHtml } from './inspector.js';
import { InstructionCursor } from './instruction-cursor.js';

/** @param {HTMLElement} root
 * @param {{ stageId: string, locale?: 'ja' | 'en', onProgramChange?: (id: string) => void }} config */
export function mountFt16(root, { stageId, onProgramChange = () => {}, locale = 'ja' }) {
  const t = createTranslator(locale);
  const $ = id => root.querySelector(`#${id}`);
  const allPrograms = localizeData([...samples, ...experiments.filter(p => p.stage === stageId)], locale);
  const abort = new AbortController();
  let disposed = false, frameId = 0, generation = 0;

  const GAP = 3; // observation time between settling and the next clock edge

  const store = {
    // The selected stage is also read from the 8-bit version's key; edited
    // programs are not, because they are written for the old instruction set.
    get(key) { try { return localStorage.getItem(`ft16:${key}`) ?? (key === 'stage' ? localStorage.getItem(`ft8:${key}`) : null); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(`ft16:${key}`, value); } catch { /* storage unavailable */ } },
  };

  const app = {
    stage: null, program: null, assembled: null, sim: null, view: null,
    playing: false, stepMode: null, settledAt: null, selection: null,
    options: { hazardMode: 2, memLatency: 2, mainLatency: 4, memPorts: 1 },
    history: [], undo: [], lastRenderKey: '', instructionCursor: null,
  };
  const isTd4 = () => app.stage.isa === 'td4';
  const hasInstructionStep = () => app.stage.family === 'multi' || app.stage.family.startsWith('pipe');

  function init() {
    const params = new URLSearchParams(location.search);
    app.view = new CircuitView($('circuit'), { onSelect: select, onBeforeExternal: saveUndo });
    const mode = Number(params.get('mode'));
    if ([0, 1, 2, 3].includes(mode) && params.has('mode')) app.options.hazardMode = mode;
    if (params.has('ports')) app.options.memPorts = Number(params.get('ports')) === 2 ? 2 : 1;
    setStage(stageId, params.get('program'));

    $('play').onclick = () => (app.playing ? pause() : play());
    $('step-cycle').onclick = () => step('cycle');
    $('step-instr').onclick = () => step('instr');
    $('step-event').onclick = () => { pause(); saveUndo(); if (app.sim.busy) app.sim.next(); else clockNow(); refresh(); };
    $('step-time').onclick = () => { pause(); saveUndo(); advance(1); refresh(); };
    $('step-back').onclick = stepBack;
    $('reset').onclick = () => loadSim();
    $('fit').onclick = () => app.view.fit();
    $('zoom-in').onclick = () => app.view.zoom(0.7);
    $('zoom-out').onclick = () => app.view.zoom(1 / 0.7);
    $('front-values').onchange = e => { app.view.showFrontValues = e.target.checked; app.view.render(true); };
    $('program-select').onchange = e => setProgram(e.target.value);
    $('apply-source').onclick = applySource;
    $('compare').onclick = compareAll;
    $('inspector').addEventListener('click', event => {
      const target = event.target.closest('[data-goto]');
      if (!target) return;
      const [kind, id] = target.dataset.goto.split(':');
      select({ kind, id });
      if (kind === 'module') app.view.focus(id);
    });
    root.addEventListener('keydown', event => {
      if (event.target.closest('textarea, select, input, button, a, summary')) return;
      if (event.key === ' ') { event.preventDefault(); app.playing ? pause() : play(); }
      if (event.key === 'c') step('cycle');
      if (event.key === 'i' && hasInstructionStep()) step('instr');
      if (event.key === 'n') $('step-event').click();
    }, { signal: abort.signal });
    let last = performance.now();
    const frame = now => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!document.hidden) tick(dt);
      if (!disposed) frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
  }

  function setStage(id, programId) {
    const stage = stageById(id) ?? stages[0];
    app.stage = stage;
    store.set('stage', stage.id);
    $('stage-title').textContent = t("段階 {0}: {1}", stage.id, stage.title);
    $('stage-summary').textContent = t(stage.summary);
    $('compare-card').hidden = isTd4();
    renderOptions();
    const fitting = allPrograms.filter(p => programFits(stage, p));
    $('program-select').innerHTML = [t("機能を確認する実験"), t("サンプルプログラム")].map((label, i) => `<optgroup label="${label}">${fitting.filter(p => Boolean(p.stage) === !i).map(p => `<option value="${p.id}">${p.title}</option>`).join('')}</optgroup>`).join('') + t("<option value=\"custom\">(編集したプログラム)</option>");
    const preferred = fitting.find(p => p.id === programId) ?? fitting.find(p => p.stage === stage.id) ?? fitting.find(p => p.id === stage.defaultProgram) ?? fitting[0];
    app.view.view = null;
    const next = () => setProgram(programId === 'custom' ? 'custom' : preferred.id);
    if (isBuilt(stage.id)) { next(); return; }
    // Placing and routing a large stage takes a moment: say so, then build.
    pause();
    $('status').textContent = t("回路を配置・配線しています…");
    frameId = requestAnimationFrame(() => { if (!disposed) next(); });
  }

  function renderOptions() {
    const s = app.stage;
    let html = '';
    if (s.family.startsWith('pipe')) {
      html += t("<label class=\"field\">ハザード処理 <select id=\"opt-mode\">{0}</select></label>", localizeData(MODE_NAMES, locale).map((n, i) => `<option value="${i}" ${i === app.options.hazardMode ? 'selected' : ''}>${i}: ${n}</option>`).join(''));
      if (!s.features.cache) html += t("<label class=\"field\">メモリのポート <select id=\"opt-ports\">{0}</select></label>", [[1, t("1 (構造ハザードあり)")], [2, t("2 (理想的なメモリ)")]].map(([n, t]) => `<option value="${n}" ${n === app.options.memPorts ? 'selected' : ''}>${t}</option>`).join(''));
    }
    if (s.family === 'multi') html += t("<label class=\"field\">メモリの待ち <select id=\"opt-mem\">{0}</select></label>", [1, 2, 3].map(n => t("<option value=\"{0}\" {1}>{2} クロック</option>", n, n === app.options.memLatency ? 'selected' : '', n)).join(''));
    if (s.features.cache) html += t("<label class=\"field\">メインメモリ <select id=\"opt-main\">{0}</select></label>", [2, 4, 8].map(n => t("<option value=\"{0}\" {1}>{2} クロック</option>", n, n === app.options.mainLatency ? 'selected' : '', n)).join(''));
    $('stage-options').innerHTML = html;
    $('opt-mode')?.addEventListener('change', e => { app.options.hazardMode = Number(e.target.value); loadSim(); });
    $('opt-ports')?.addEventListener('change', e => { app.options.memPorts = Number(e.target.value); loadSim(); });
    $('opt-mem')?.addEventListener('change', e => { app.options.memLatency = Number(e.target.value); loadSim(); });
    $('opt-main')?.addEventListener('change', e => { app.options.mainLatency = Number(e.target.value); loadSim(); });
  }

  const customKey = () => (isTd4() ? 'custom-td4' : 'custom');
  /* A program edited in the 8-bit version is kept, commented out, so it can
   * be rewritten for FT16 (it is not valid FT16 assembly as it stands). */
  function legacyProgram() {
    let old = null;
    try { old = localStorage.getItem('ft8:custom'); } catch { /* storage unavailable */ }
    if (!old || isTd4()) return null;
    return t("; 8 bit 版 (FT8) で編集したプログラムです。FT16 の命令に書き直してください (共通 ISA 解説)。\n{0}\n    HALT\n", old.split(/\r?\n/).map(line => `; ${line}`).join('\n'));
  }
  function customProgram(source) {
    return { id: 'custom', isa: app.stage.isa, title: t("編集したプログラム"), needs: [], description: t("自分で編集したプログラムです。"), source };
  }

  function setProgram(id) {
    let program = allPrograms.find(p => p.id === id && programFits(app.stage, p));
    if (id === 'custom' || !program) {
      const fallback = allPrograms.find(p => programFits(app.stage, p));
      program = customProgram(store.get(customKey()) ?? legacyProgram() ?? fallback.source);
    }
    app.program = program;
    $('program-select').value = program.id;
    $('program-description').textContent = program.description;
    $('source').value = program.source;
    $('initial-state').textContent = program.initialDescription ?? t("標準リセット: PC = 0、レジスタとフラグ = 0。FT16 は割り込み禁止・カーネルモード。");
    $('asm-errors').innerHTML = '';
    try {
      app.assembled = assembleFor(buildStage(app.stage.id), program.source, t);
    } catch (error) {
      showErrors(error);
      return;
    }
    onProgramChange(program.id);
    loadSim();
  }

  function applySource() {
    const source = $('source').value;
    try {
      const assembled = assembleFor(buildStage(app.stage.id), source, t);
      store.set(customKey(), source);
      app.program = customProgram(source);
      app.assembled = assembled;
      $('program-select').value = 'custom';
      $('program-description').textContent = app.program.description;
      $('asm-errors').innerHTML = '';
      $('initial-state').textContent = t("標準リセットから実行します (実験の初期状態は引き継ぎません)。");
      onProgramChange('custom');
      loadSim();
    } catch (error) { showErrors(error); }
  }

  function showErrors(error) {
    const list = error instanceof AssemblyError || error instanceof Td4AssemblyError ? error.errors : [{ line: '?', message: String(error.message ?? error) }];
    $('asm-errors').innerHTML = list.map(e => t("<li>{0} 行: {1}</li>", e.line, escapeHtml(t(e.message)))).join('');
    $('editor-box').open = true;
  }

  function loadSim() {
    pause();
    generation++;
    $('compare').disabled = false;
    const circuit = buildStage(app.stage.id);
    app.sim = new Simulator(circuit, { program: app.assembled, options: { ...app.options }, initialState: app.program.initialState ?? {}, settleOnReset: false });
    const sw = switchModule(app.sim);
    if (app.program.switches && sw) app.sim.setExternal(sw, 'sw', app.program.switches);
    // Keep startup arrivals visible. The first cycle step only settles them;
    // the listing shows propagation until that first settled boundary.
    app.instructionCursor = new InstructionCursor(app.sim);
    app.history = [];
    app.undo = [];
    app.settledAt = null;
    app.view.mount(app.sim);
    select(null);
    renderListing();
    $('comparison').innerHTML = '';
    $('compare-card').hidden = isTd4() || Boolean(app.program.stage);
    refresh(true);
  }

  // ---- playback --------------------------------------------------------------
  function saveUndo() {
    const sim = app.sim;
    const key = `${sim.emissionSeq}:${sim.time}:${sim.cycle}:${sim.busy}`;
    if (app.undo.at(-1)?.key === key) return;
    app.undo.push({ key, sim: sim.snapshot(), history: structuredClone(app.history), settledAt: app.settledAt });
    if (app.undo.length > 50) app.undo.shift();
    $('step-back').disabled = false;
  }

  function stepBack() {
    pause();
    const previous = app.undo.pop();
    if (!previous) return;
    app.sim.restore(previous.sim);
    app.history = previous.history;
    app.settledAt = previous.settledAt;
    app.instructionCursor.update();
    app.view.mount(app.sim);
    select(app.selection);
    refresh(true);
  }

  function play() {
    if (cpuStopped(app.sim) && !app.sim.busy) return;
    saveUndo();
    app.playing = true; app.stepMode = null;
    $('play').textContent = t("❚❚ 一時停止");
  }
  function pause() {
    app.playing = false; app.stepMode = null;
    $('play').textContent = t("▶ 再生");
  }
  function step(kind) {
    if (cpuStopped(app.sim) && !app.sim.busy) return;
    saveUndo();
    app.playing = true;
    // Finish pending propagation without adding an edge. Only a step from
    // a settled circuit sends the next clock.
    app.stepMode = { kind, cycle: app.sim.busy ? app.sim.cycle : app.sim.cycle + 1, retired: app.sim.retired };
    $('play').textContent = t("❚❚ 一時停止");
  }

  function clockNow() {
    if (app.playing && !app.stepMode) saveUndo();
    recordHistory();
    app.sim.clock();
    app.instructionCursor.update();
    app.settledAt = null;
  }

  function advance(budget) {
    const sim = app.sim;
    const target = sim.time + budget;
    let guard = 0;
    while (sim.time < target - 1e-9 && guard++ < 10000) {
      if (sim.busy) {
        sim.advance(Math.min(target, sim.queue.peek().time) - sim.time);
        continue;
      }
      if (app.settledAt === null) app.settledAt = sim.time;
      if (!app.playing) { sim.advance(target - sim.time); break; }
      if (shouldStop()) { pause(); break; }
      const clockAt = app.settledAt + GAP;
      if (clockAt > target) { sim.advance(target - sim.time); break; }
      sim.advance(Math.max(0, clockAt - sim.time));
      clockNow();
    }
  }

  function shouldStop() {
    const sim = app.sim, mode = app.stepMode;
    if (cpuStopped(sim)) return true;
    if (!mode) return false;
    if (mode.kind === 'cycle') return sim.cycle >= mode.cycle;
    if (mode.kind === 'instr') return sim.retired > mode.retired;
    return false;
  }

  function tick(dt) {
    if (!app.sim) return;
    const speed = $('speed').value;
    if (app.playing && speed === 'instant') {
      const start = performance.now();
      while (performance.now() - start < 14) {
        app.sim.settle();
        if (shouldStop()) { pause(); break; }
        clockNow();
      }
      app.sim.settle();
      for (const w of app.sim.wires.values()) { w.transitions = []; w.initial = w.arrived; }
    } else if (app.playing) advance(dt * Number(speed));
    refresh();
  }

  // ---- rendering ---------------------------------------------------------------
  function refresh(force = false) {
    const sim = app.sim;
    // A final input arrival need not emit another output. Still refresh on
    // busy → settled so the listing, inspector and status finish together.
    const key = `${sim.emissionSeq}:${sim.time}:${sim.cycle}:${sim.busy}`;
    const changed = force || key !== app.lastRenderKey;
    app.view.render(changed);
    if (!changed && !force) return;
    app.lastRenderKey = key;
    $('step-back').disabled = app.undo.length === 0;
    $('step-instr').hidden = !hasInstructionStep();
    $('step-cycle').textContent = sim.busy ? t("安定まで") : t("1クロック");
    $('step-cycle').title = sim.busy ? t("クロックを送らず、現在の伝播が安定するまで進める") : t("クロックを1回送り、その結果の伝播が安定するまで進める");
    renderState();
    renderChart();
    highlightListing();
    if (app.selection) $('inspector').innerHTML = inspectorHtml(sim, app.selection, locale);
    const stopped = cpuStopped(sim) && !sim.busy;
    $('status').textContent = t("t = {0} · クロック {1} · 完了した命令 {2}{3}", sim.time.toFixed(1), sim.cycle, sim.retired, stopped ? t(" · 停止") : sim.busy ? t(" · 伝播中") : t(" · 安定"));
    $('signal-phase').textContent = sim.busy
      ? sim.cycle === 0
        ? t("入力の変化が各端子へ伝播しています。レジスタはまだ取り込んでいません。")
        : t("クロック {0} で到着済みの入力を取り込みました (t = {1})。現在は、その結果の信号が伝播しています。", sim.cycle, sim.clockTime.toFixed(1))
      : stopped ? t("停止しました。") : t("入力が安定しました。次のクロックの立ち上がりでレジスタへ取り込みます。");
    for (const id of ['play', 'step-cycle', 'step-instr']) $(id).disabled = stopped;
  }

  function timingRows(sim) {
    const settled = sim.cycleLog.filter(c => c.settle !== null);
    const lastSettle = settled.at(-1)?.settle;
    const depth = Math.max(0, sim.cycleDepth, ...sim.cycleLog.map(c => c.depth ?? 0));
    const cpi = sim.retired ? (sim.cycle / sim.retired).toFixed(2) : '-';
    return t("<dt>クロック</dt><dd>{0} (命令 {1}, CPI {2})</dd>", sim.cycle, sim.retired, cpi)
      + t("<dt>安定まで</dt><dd>{0}</dd>", lastSettle !== undefined ? t("{0} t (直前のクロック)", lastSettle.toFixed(1)) : '-')
      + t("<dt>論理段数</dt><dd>最大 {0} (推定クロック周期)</dd>", depth);
  }

  function renderState() {
    const sim = app.sim;
    const s = sim.circuit.inspect(sim);
    if (s.td4) {
      const cell = (name, value) => `<div><b>${name}</b>${bin(value, 4)}</div>`;
      let html = `<div class="regs">${cell('A', s.a)}${cell('B', s.b)}${cell('OUT', s.out)}${cell('PC', s.pc)}</div><dl class="kv">`;
      html += `<dt>C</dt><dd>${s.carry}</dd><dt>INPUT</dt><dd>${bin(s.input, 4)} (${s.input})</dd>`;
      html += `<dt>OUTPUT</dt><dd><span class="leds-inline">${[3, 2, 1, 0].map(i => `<i class="${(s.out >> i) & 1 ? 'on' : ''}"></i>`).join('')}</span> ${s.out}</dd>`;
      $('state').innerHTML = `${html}${timingRows(sim)}</dl>`;
      return;
    }
    let html = t("<div class=\"regs\">{0}</div><p class=\"note\">r0 は常に 0、r6 = SP、r7 = LR (戻り番地)</p>", s.regs.map((r, i) => `<div title="${[t("常に0"), '', '', '', '', '', t("SP (スタックポインタ)"), t("LR (戻り番地)")][i]}"><b>r${i}</b>${hex(r)}</div>`).join(''));
    html += '<dl class="kv">';
    html += `<dt>PC</dt><dd>${hex(s.pc)}${s.halted ? t(" (停止)") : ''}</dd>`;
    html += t("<dt>フラグ</dt><dd>{0}</dd>", flagsText(s.flags));
    if (s.csr) {
      html += t("<dt>割り込み</dt><dd>{0}{1}</dd>", s.ie ? t("許可") : t("禁止"), s.kernel !== undefined ? t(" · {0}モード", s.kernel ? t("カーネル") : t("ユーザー")) : '');
      html += `<dt>EPC/CAUSE</dt><dd>${hex(s.csr.epc)} / ${t(CAUSE_NAMES[s.csr.cause] ?? s.csr.cause)}</dd>`;
    }
    if (s.led !== undefined) html += `<dt>LED</dt><dd><span class="leds-inline">${Array.from({ length: 8 }, (_, i) => `<i class="${(s.led >> (7 - i)) & 1 ? 'on' : ''}"></i>`).join('')}</span> ${hex(s.led, 2)}</dd>`;
    html += timingRows(sim);
    if (sim.modules.has('ICC')) {
      const i = sim.state('ICC'), d = sim.state('DCC');
      const rate = (h, m) => (h + m ? `${Math.round((100 * h) / (h + m))}%` : '-');
      html += t("<dt>キャッシュ</dt><dd>命令 {0} · データ {1} ヒット</dd>", rate(i.hits, i.misses), rate(d.hits, d.misses));
    }
    if (sim.trapCount) html += t("<dt>トラップ</dt><dd>{0} 回</dd>", sim.trapCount);
    html += '</dl>';
    const last = sim.cycleLog.at(-1);
    const events = [];
    if (last?.stall === 'data') events.push(t("データハザードでストールしました。"));
    if (last?.stall === 'control') events.push(t("分岐系の命令を待って取り込みを止めました。"));
    if (last?.stall === 'structural') events.push(t("メモリのポートをデータ側が使ったので、命令を取り込めませんでした (構造ハザード)。"));
    if (last?.stall === 'fetch') events.push(t("命令キャッシュのミスで取り込みを待ちました。"));
    if (last?.flush) events.push(t("行き先の修正で命令を捨てました (フラッシュ)。"));
    if (last?.trap) events.push(t("トラップ: {0}", CAUSE_NAMES[last.trap]));
    if (events.length) html += t("<p class=\"note\" style=\"margin-top:6px\">直前のクロック:</p><ul class=\"events\">{0}</ul>", events.map(e => `<li>${e}</li>`).join(''));
    $('state').innerHTML = html;
  }

  function recordHistory() {
    const s = app.sim.circuit.inspect(app.sim);
    app.history.push({ cycle: app.sim.cycle + 1, stages: s.stages });
    if (app.history.length > 40) app.history.shift();
  }

  const pcText = pc => (isTd4() ? pc.toString(16).toUpperCase() : hex(pc, 3));
  function instructionText(pc) {
    if (pc === undefined || pc === null) return '';
    if (isTd4()) return disassembleTd4(app.assembled.rom[pc] ?? 0);
    return disassemble(app.assembled.mem[physicalPc(pc)] ?? 0, app.stage.profile, pc);
  }

  function renderChart() {
    const sim = app.sim;
    const stagesNow = sim.circuit.inspect(sim).stages;
    const family = app.stage.family;
    $('chart-title').textContent = family.startsWith('pipe') ? t("パイプライン図 (直近のクロック)") : family === 'multi' ? t("状態の移り変わり") : t("実行した命令");
    const recent = [...app.history.slice(-9), { cycle: sim.cycle + 1, stages: stagesNow, current: true }];
    const log = new Map(sim.cycleLog.map(c => [c.cycle, c]));
    const cell = (st, cycle) => {
      if (!st.valid && st.valid !== undefined) return '<td class="empty">·</td>';
      const info = log.get(cycle);
      const cls = info?.stall && st.name === 'ID' ? 'stall' : '';
      const label = family === 'multi' ? `${st.name}` : pcText(st.pc ?? 0);
      const color = family === 'multi' ? '' : ` style="color:hsl(${((st.pc ?? 0) * 47) % 360} 55% 38%)"`;
      return `<td class="${cls}"${color} title="${escapeHtml(instructionText(st.pc))}">${label}</td>`;
    };
    if (family !== 'pipe3' && family !== 'pipe5') {
      const rows = recent.map(h => `<tr><th>${h.cycle}${h.current ? '*' : ''}</th>${cell(h.stages[0], h.cycle)}<td style="text-align:left">${escapeHtml(instructionText(h.stages[0].pc))}</td></tr>`).join('');
      $('chart').innerHTML = t("<table class=\"chart\"><tr><th>クロック</th><th>{0}</th><th>命令</th></tr>{1}</table>", family === 'multi' ? t("状態") : 'PC', rows);
      return;
    }
    const names = stagesNow.map(s => s.name);
    let html = t("<table class=\"chart\"><tr><th>段</th>{0}</tr>", recent.map(h => `<th>${h.cycle}${h.current ? '*' : ''}</th>`).join(''));
    names.forEach((name, i) => { html += `<tr><th>${name}</th>${recent.map(h => cell(h.stages[i], h.cycle)).join('')}</tr>`; });
    html += t("</table><p class=\"note\">数字は各段にある命令の番地 (同じ色は同じ番地)。* は次のクロックで動く状態。黄色はストール。</p>");
    $('chart').innerHTML = html;
  }

  /* Virtual PC → physical word, through the instruction TLB in user mode. */
  function physicalPc(pc) {
    const sim = app.sim;
    if (!sim.modules.has('ITLB') || sim.circuit.inspect(sim).kernel) return pc;
    const e = sim.state('ITLB').entries.find(x => x.valid && x.vpn === pc >> PAGE_BITS);
    return e ? (e.ppn << PAGE_BITS) | (pc & ((1 << PAGE_BITS) - 1)) : pc;
  }

  function renderListing() {
    const src = app.assembled.source;
    const entries = [...src.entries()].filter(([, info]) => !info.data).sort((a, b) => a[0] - b[0]);
    $('listing').innerHTML = entries.map(([addr, info]) => {
      const text = info.part ? `  ↳ ${disassemble(app.assembled.mem[addr], app.stage.profile, info.virtual)}` : info.text;
      return `<li data-addr="${addr}"><span class="addr">${pcText(addr)}</span><span>${escapeHtml(text)}</span></li>`;
    }).join('');
  }
  function highlightListing() {
    const tags = app.instructionCursor.update();
    const propagating = app.instructionCursor.phase === 'propagating';
    for (const li of $('listing').children) {
      const names = tags.get(Number(li.dataset.addr));
      li.classList.toggle('active', !!names);
      li.classList.toggle('propagating', !!names && propagating);
      li.classList.toggle('waiting', !!names && !propagating);
      let tag = li.querySelector('.tag');
      if (names) {
        if (!tag) { tag = document.createElement('span'); tag.className = 'tag'; li.append(tag); }
        tag.textContent = ['td4', 'single'].includes(app.stage.family)
          ? (propagating ? t("伝播中") : t("取り込み待ち"))
          : (propagating ? t("{0} · 伝播中", names.join(' ')) : t("{0} · 取り込み待ち", names.join(' ')));
      } else tag?.remove();
    }
  }

  function select(selection) {
    app.selection = selection;
    app.view.select(selection);
    $('inspector').innerHTML = selection ? inspectorHtml(app.sim, selection, locale) : t("<p class=\"note\">回路のモジュールや配線をクリックすると、役割と「なぜ今この値なのか」を表示します。</p>");
  }

  // ---- comparison ------------------------------------------------------------
  async function compareAll() {
    const program = app.program;
    const token = generation;
    const assembled = app.assembled;
    const options = { ...app.options };
    const targets = stages.filter(s => s.isa === 'ft16' && (program.id === 'custom' || programFits(s, program)));
    $('compare').disabled = true;
    const rows = [];
    for (const stage of targets) {
      $('comparison').innerHTML = t("<p class=\"note\">段階 {0} を実行中…</p>", stage.id);
      await new Promise(r => setTimeout(r, 0));
      if (disposed || token !== generation) return;
      try {
        const sim = new Simulator(buildStage(stage.id), { program: assembled, options, initialState: program.initialState ?? {} });
        if (program.switches && sim.modules.has('IO')) sim.setExternal('IO', 'sw', program.switches);
        let n = 0;
        const limit = program.id === 'os' ? 200000 : 20000;
        while (n < limit) {
          sim.settle();
          if (cpuStopped(sim)) break;
          sim.clock(); n++;
          if (n % 500 === 0) { await new Promise(r => setTimeout(r, 0)); if (disposed || token !== generation) return; }
        }
        const depth = Math.max(...sim.cycleLog.map(c => c.depth ?? 0), sim.cycleDepth);
        rows.push({ stage, cycles: sim.cycle, retired: sim.retired, depth, done: cpuStopped(sim) });
      } catch (error) {
        rows.push({ stage, error: error.message });
      }
    }
    const best = Math.min(...rows.filter(r => r.cycles).map(r => r.cycles * r.depth));
    $('comparison').innerHTML = t("<table class=\"compare\"><tr><th>段階</th><th>クロック</th><th>CPI</th><th>段数</th><th>推定時間</th></tr>{0}</table>\n      <p class=\"note\">段数は1クロックの間に信号が通るモジュールの遅延の合計 (最大) で、クロック周期の目安です。推定時間 = クロック数 × 段数 (最速を 1 とした比)。モジュールの遅延は教材用の目安値です。パイプラインのハザード処理・メモリのポート数は上の設定に従います。</p>", rows.map(r => r.error ? `<tr><td>${r.stage.id}</td><td colspan="4">${escapeHtml(r.error)}</td></tr>` :
      `<tr><td>${r.stage.id} ${t(r.stage.title)}</td><td>${r.cycles}${r.done ? '' : '+'}</td><td>${(r.cycles / Math.max(1, r.retired)).toFixed(2)}</td><td>${r.depth}</td><td>${(r.cycles * r.depth / best).toFixed(2)}×</td></tr>`).join(''));
    $('compare').disabled = false;
  }

  const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));


  init();
  return {
    dispose() { disposed = true; generation++; abort.abort(); cancelAnimationFrame(frameId); app.view.destroy(); },
    loadExperiment(id) { setProgram(id); },
    focusModule(id) { select({ kind: 'module', id }); app.view.focus(id); },
  };
}
