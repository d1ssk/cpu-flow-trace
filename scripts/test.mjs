import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? collect(path) : /\.test\.(ts|js)$/.test(entry.name) ? [path] : [];
  }));
  return paths.flat();
}
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...await collect('src')], { stdio: 'inherit' });
process.exit(result.status ?? 1);
