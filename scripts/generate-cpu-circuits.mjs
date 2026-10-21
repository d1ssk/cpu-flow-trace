import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'src/circuits/td4/generated');
const hash = value => createHash('sha256').update(value).digest('hex');
async function sources(dir) {
  const result = [];
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory() && entry.name !== 'generated') result.push(...await sources(path));
    else if (entry.isFile() && /\.(js|json)$/.test(path) && !path.includes('.test.')) result.push(path);
  }
  return result;
}
const inputs = [...await sources('src/circuits/td4'), ...await sources('src/simulator/td4'), relative(root, fileURLToPath(import.meta.url))].sort();
async function fingerprint() {
  return hash(await Promise.all(inputs.map(async file => `${file}:${hash(await readFile(resolve(root, file)))}`)).then(parts => parts.join('\n')));
}
const sourceHash = await fingerprint();
let previous;
try { previous = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8')); } catch { /* First generation. */ }
let valid = previous?.sourceHash === sourceHash && Object.keys(previous?.artifacts ?? {}).length === 27;
if (valid) for (const [file, digest] of Object.entries(previous.artifacts)) {
  try { if (hash(await readFile(resolve(output, file))) !== digest) valid = false; } catch { valid = false; }
}
if (process.argv.includes('--check')) {
  if (!valid) throw Error('CPU circuit data is stale or missing. Run npm run generate:cpu.');
  console.log('CPU circuit data is current (27 circuits, wire width 1.3).');
} else if (valid && !process.argv.includes('--force')) {
  console.log('CPU circuit data is current.');
} else {
  const { default: builder } = await import('../src/circuits/td4/build/details.js');
  const artifacts = {}, contents = {};
  for (const id of Object.keys(builder.specs)) for (const view of ['module', 'nand', 'mos']) {
    const file = `${id}-${view}.json`;
    contents[file] = JSON.stringify(builder.definition(id, view)) + '\n';
    artifacts[file] = hash(contents[file]);
  }
  // A changed source must never be marked current using an older computation.
  if (await fingerprint() !== sourceHash) throw Error('Circuit sources changed during generation. Retry generation.');
  await mkdir(output, { recursive: true });
  for (const [file, content] of Object.entries(contents)) {
    const target = resolve(output, file);
    await writeFile(`${target}.tmp`, content);
    await rename(`${target}.tmp`, target);
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ sourceHash, inputs, artifacts }, null, 2) + '\n');
  console.log('Generated 27 CPU circuits (9 modules × 3 constructions), wire width 1.3.');
}
