import modules from '../src/circuits/td4/specs.json' with { type: 'json' };
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { articles } from '../src/articles/index.ts';

// Explicit entry files allow clean URLs on hosts without SPA rewrites.
// The body is hydrated client-side; this is not HTML prerendering.
const template = await readFile('dist/index.html', 'utf8');
for (const locale of ['ja', 'en']) {
  const localized = template.replace('<html lang="ja">', `<html lang="${locale}">`);
  for (const page of ['', ...Object.keys(modules).map(id => `modules/${id}`), 'learn', ...articles.map(article => `learn/${article.id}`)]) {
    const directory = `dist/${locale}/${page}`;
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/index.html`, localized);
  }
}
await writeFile('dist/404.html', template);
