import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import esbuild from 'esbuild';
import path from 'node:path';

// 1. Build electron main & preload
await esbuild.build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  outdir: 'dist-electron',
  external: ['electron'],
  sourcemap: true
});

// 2. Start Vite server
const server = await createServer({
  configFile: path.resolve('vite.config.ts'),
  server: { port: 5173 }
});
await server.listen();
const address = server.httpServer?.address();
const port = typeof address === 'object' && address ? address.port : 5173;
console.log(`Vite dev server running on http://localhost:${port}`);

// 3. Launch Electron
const electronProcess = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron', '.'],
  {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${port}` }
  }
);

electronProcess.on('close', () => {
  server.close();
  process.exit();
});
