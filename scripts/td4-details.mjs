import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, rename } from 'node:fs/promises';
import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const output = resolve(root, 'workbench/td4_v2/detail-data');
export const hash = value => createHash('sha256').update(value).digest('hex');
export async function sources() {
  const shared = (await readdir(resolve(root, 'workbench/td4'))).filter(name => name.endsWith('.js')).map(name => 'workbench/td4/' + name);
  return [...shared, ...['details', 'dense-layout', 'wide-details', 'layout'].map(name => `workbench/td4_v2/${name}.js`), 'scripts/td4-details.mjs', 'scripts/generate-td4-details.cjs'].sort();
}
export async function fingerprint() {
  const inputs = await sources();
  const contents = await Promise.all(inputs.map(async file => [file, await readFile(resolve(root, file), 'utf8')]));
  return { inputs, hash: hash(JSON.stringify(contents)) };
}
export async function atomicWrite(file, content) {
  await mkdir(output, { recursive: true });
  const temporary = file + '.' + process.pid + '.tmp';
  await writeFile(temporary, content);
  await rename(temporary, file);
}
async function current(sourceHash) {
  try {
    const manifest = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
    if (manifest.sourceHash !== sourceHash) return false;
    for (const [file, digest] of Object.entries(manifest.artifacts)) {
      if (hash(await readFile(resolve(output, file))) !== digest) return false;
    }
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return false;
    throw error;
  }
}
export async function ensureGenerated({ check = false, force = false } = {}) {
  for (;;) {
    const source = await fingerprint();
    if (!force && await current(source.hash)) return;
    if (check) throw Error('TD4 detail data is stale or missing. Run npm run generate:td4-details.');
    console.log('[td4-details] Recomputing and saving circuit layouts…');
    await new Promise((accept, reject) => {
      const child = spawn(process.execPath, [resolve(root, 'scripts/generate-td4-details.cjs')], { cwd: root, stdio: 'inherit' });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? accept() : reject(Error(`TD4 generation failed (${code})`)));
    });
    force = false;
    // A save during calculation must trigger a fresh process and fresh imports.
    // The worker never publishes a generation assembled from changing sources.
  }
}
async function main() {
  const args = process.argv.slice(2);
  await ensureGenerated({ check: args.includes('--check'), force: args.includes('--force') });
  if (!args.includes('--watch')) return;
  let timer, running = Promise.resolve();
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      running = running.then(() => ensureGenerated()).catch(error => console.error(error));
    }, 150);
  };
  for (const directory of ['workbench/td4', 'workbench/td4_v2', 'scripts']) {
    watch(resolve(root, directory), (_, filename) => {
      if (filename && /\.(?:js|mjs|cjs)$/.test(filename) && !filename.endsWith('.test.cjs') && !filename.endsWith('.browser.cjs')) changed();
    });
  }
  console.log('[td4-details] Watching circuit and layout sources.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
