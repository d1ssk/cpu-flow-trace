import modules from '../src/circuits/td4/specs.json' with { type: 'json' };
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stages } from '../src/ft16/stages/index.js';
import { articles } from '../src/articles/index.ts';

// Explicit entry files allow clean URLs on hosts without SPA rewrites.
// The body is hydrated client-side; this is not HTML prerendering.
const template = await readFile('dist/index.html', 'utf8');
// Social crawlers read the initial HTML without running the React application.
const siteUrl = new URL(`${(process.env.SITE_URL || 'https://d1ssk.github.io/cpu-flow-trace/').replace(/\/+$/, '')}/`);
if (!['http:', 'https:'].includes(siteUrl.protocol) || siteUrl.search || siteUrl.hash) {
  throw new Error('SITE_URL must be an absolute HTTP(S) site URL without a query or fragment.');
}
const imageUrl = new URL('og-image.png', siteUrl).href;
const descriptions = {
  ja: '小さなCPUの信号の流れをたどる。論理回路の接続と信号伝播を観察できるインタラクティブなシミュレーター。',
  en: 'Trace signal flow through a small CPU. An interactive simulator for exploring logic circuits, wire propagation, and how a CPU executes programs.',
};
const imageAlts = {
  ja: 'TD4の4ビットCPU回路。入力、ROM、クロック、出力を結ぶ配線とトランジスタを表示。',
  en: 'A TD4 4-bit CPU circuit showing transistors and wires connecting inputs, ROM, clock, and outputs.',
};
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function entry(locale, path) {
  const meta = (attribute, key, value) => `<meta ${attribute}="${key}" content="${escape(value)}" />`;
  const social = [
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', 'How a CPU Works'),
    meta('property', 'og:title', 'How a CPU Works'),
    meta('property', 'og:description', descriptions[locale]),
    meta('property', 'og:url', new URL(path, siteUrl).href),
    meta('property', 'og:locale', locale === 'ja' ? 'ja_JP' : 'en_US'),
    meta('property', 'og:locale:alternate', locale === 'ja' ? 'en_US' : 'ja_JP'),
    meta('property', 'og:image', imageUrl),
    meta('property', 'og:image:type', 'image/png'),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', imageAlts[locale]),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', 'How a CPU Works'),
    meta('name', 'twitter:description', descriptions[locale]),
    meta('name', 'twitter:image', imageUrl),
    meta('name', 'twitter:image:alt', imageAlts[locale]),
  ].join('\n    ');
  return template
    .replace('<html lang="ja">', `<html lang="${locale}">`)
    .replace(/<meta name="description" content="[^"]*" \/>/, meta('name', 'description', descriptions[locale]))
    .replace('<!-- social-metadata -->', social);
}

await writeFile('dist/index.html', entry('ja', ''));
for (const locale of ['ja', 'en']) {
  for (const page of ['', 'ft16', 'ft16/isa', ...stages.map(stage => `ft16/${stage.id}`), ...Object.keys(modules).map(id => `modules/${id}`), 'learn', ...articles.map(article => `learn/${article.id}`)]) {
    const directory = `dist/${locale}/${page}`;
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/index.html`, entry(locale, `${locale}/${page ? `${page}/` : ''}`));
  }
}
await writeFile('dist/404.html', entry('ja', ''));
