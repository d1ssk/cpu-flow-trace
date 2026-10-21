import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

function td4Details(): Plugin {
  const run = promisify(execFile);
  let requested = 0;
  let generation: Promise<void> | undefined;
  const generate = () => {
    requested++;
    return generation ??= (async () => {
      let revision;
      do {
        revision = requested;
        try {
          const result = await run(process.execPath, ['scripts/generate-cpu-circuits.mjs']);
          if (result.stdout) console.log(result.stdout.trim());
        } catch (error) {
          if (revision === requested) throw error;
        }
      } while (revision !== requested);
    })().finally(() => { generation = undefined; });
  };
  const isSource = (file: string) => !file.includes('.test.') && (/\/src\/(circuits|simulator)\/td4\/.*\.js$/.test(file)
    || file.endsWith('/src/circuits/td4/specs.json')
    || file.endsWith('/scripts/generate-cpu-circuits.mjs'));
  return {
    name: 'td4-precomputed-details',
    async buildStart() { await generate(); },
    configureServer(server) {
      server.watcher.add(['src/circuits/td4', 'src/simulator/td4', 'scripts'].map(dir => resolve(dir)));
      // Never serve an updated index before its generation has completed.
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.includes('/src/circuits/td4/generated/')) return next();
        try { await generation; next(); }
        catch (error) { res.statusCode = 500; res.end(String(error)); }
      });
    },
    async handleHotUpdate(context) {
      if (context.file.includes('/src/circuits/td4/generated/')) return [];
      if (!isSource(context.file)) return;
      await generate();
      context.server.ws.send({ type: 'full-reload', path: '*' });
      return [];
    },
  };
}

export default defineConfig({
  plugins: [react(), td4Details()],
  base: process.env.SITE_BASE || '/',
  server: { host: '127.0.0.1' },
});
