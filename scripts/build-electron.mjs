import esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const distElectron = path.resolve('dist-electron');
if (!fs.existsSync(distElectron)) {
  fs.mkdirSync(distElectron, { recursive: true });
}

try {
  await esbuild.build({
    entryPoints: ['electron/main.ts', 'electron/preload.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    outdir: 'dist-electron',
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info'
  });
  console.log('✓ Electron main and preload built successfully into dist-electron/');
} catch (error) {
  console.error('Failed to build electron code:', error);
  process.exit(1);
}
