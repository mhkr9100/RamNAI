import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rendererDist = resolve(__dirname, '../../renderer/dist');
const desktopRendererDist = resolve(__dirname, '../dist/renderer');

if (!existsSync(rendererDist)) {
  console.warn('[desktop] renderer dist not found, skipping copy');
  process.exit(0);
}

rmSync(desktopRendererDist, { recursive: true, force: true });
mkdirSync(desktopRendererDist, { recursive: true });
cpSync(rendererDist, desktopRendererDist, { recursive: true });
console.log('[desktop] copied renderer build into desktop dist');
