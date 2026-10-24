import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import english from './i18n/en.json' with { type: 'json' };
import { createTranslator, localizeData } from './i18n/index.js';
import { experiments } from './experiments.js';
import { allPrograms } from './programs/index.js';
import { buildStage } from './stages/index.js';
import { Simulator } from './sim/simulator.js';
import { assembleFor, cpuStopped } from './sim/run.js';
import { inspectorHtml } from './view/inspector.js';

const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;
const en = createTranslator('en');

test('English catalog covers authored Japanese content and preserves message parameters', () => {
  const missing = new Set();
  for (const dir of ['src/ft16', 'src/pages/ft16']) {
    for (const file of readdirSync(dir, { recursive: true }).filter(f => /\.(js|tsx?|html)$/.test(f) && !/\.test\./.test(f))) {
      const path = `${dir}/${file}`;
      const source = readFileSync(path, 'utf8');
      if (file.endsWith('.html')) {
        for (const match of source.matchAll(/>([^<>]+)<|(?:aria-label|title|label)="([^"]+)"/g)) {
          const value = (match[1] ?? match[2]).trim();
          if (japanese.test(value) && !(value in english)) missing.add(`${path}: ${value}`);
        }
      } else {
        const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
        const visit = n => {
          const value = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n) ? n.text : null;
          if (value && japanese.test(value) && !(value in english)) missing.add(`${path}: ${value}`);
          ts.forEachChild(n, visit);
        };
        visit(sf);
      }
    }
  }
  assert.deepEqual([...missing], []);
  for (const [key, value] of Object.entries(english)) {
    assert.ok(!japanese.test(value), `Untranslated: ${key}`);
    const params = text => [...new Set(text.match(/\{\d+\}/g) ?? [])].sort();
    assert.deepEqual(params(value), params(key), `Parameters: ${key}`);
  }
});

test('unknown strings and literal parameter values survive translation', () => {
  for (const value of ['constructor', 'toString', '__proto__', '$&', '{1}']) assert.equal(en(value), value);
  assert.equal(en('不明な命令: {0}', '$&{1}'), 'Unknown instruction: $&{1}');
});

test('localization preserves assembly, fixtures, and expected machine results', () => {
  for (const original of [...experiments, ...allPrograms]) {
    const translated = localizeData(original, 'en');
    for (const key of ['id', 'stage', 'source', 'initialState', 'expected', 'options']) assert.deepEqual(translated[key], original[key], `${original.id}.${key}`);
    assert.ok(!japanese.test(translated.title + translated.description));
  }
});

for (const experiment of experiments) test(`English inspector explains ${experiment.id} throughout execution`, () => {
  const circuit = buildStage(experiment.stage);
  const sim = new Simulator(circuit, { program: assembleFor(circuit, experiment.source), initialState: experiment.initialState });
  const failures = new Set();
  for (let cycle = 0; cycle < (experiment.cycles ?? 150); cycle++) {
    sim.settle();
    for (const m of sim.modules.values()) {
      const html = inspectorHtml(sim, { kind: 'module', id: m.spec.id }, 'en');
      if (japanese.test(html)) failures.add(`${m.spec.id}: ${html}`);
    }
    if (cpuStopped(sim)) break;
    sim.clock();
  }
  sim.settle();
  for (const wire of circuit.wires) {
    const html = inspectorHtml(sim, { kind: 'wire', id: wire.id }, 'en');
    if (japanese.test(html)) failures.add(html);
  }
  assert.deepEqual([...failures], []);
});

test('both assemblers report localized errors, preserving default Japanese diagnostics', () => {
  for (const [stage, source, expected] of [
    ['1', 'NO_SUCH_INSTRUCTION r1', 'Unknown instruction'],
    ['1', 'LI r1, 9999', 'Immediate does not fit'],
    ['1', 'ADD r9, r1, r2', 'Expected a register'],
    ['1', 'ADD', 'takes 2 or 3 operands'],
    ['0', 'MOV A, 16', 'Immediate must be'],
  ]) {
    const circuit = buildStage(stage);
    assert.throws(() => assembleFor(circuit, source, en), error => {
      assert.ok(error.message.includes(expected), error.message);
      assert.ok(!japanese.test(error.message), error.message);
      return true;
    });
    assert.throws(() => assembleFor(circuit, source), error => japanese.test(error.message));
  }
});
