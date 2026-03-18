import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const steps = [
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'build']],
  ['npm', ['run', 'desktop:package']],
  ['npm', ['run', 'smoke:runtime']]
];

for (const [command, args] of steps) {
  console.log(`RUN ${command} ${args.join(' ')}`);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

// Validate signed release script wiring without requiring real signing credentials.
{
  const desktopPkgPath = path.join(repoRoot, 'apps/desktop/package.json');
  const desktopPkgText = await fs.readFile(desktopPkgPath, 'utf8');
  const desktopPkg = JSON.parse(desktopPkgText);
  const scripts = desktopPkg.scripts ?? {};

  const macRelease = scripts['package:mac:release'];
  const winRelease = scripts['package:win:release'];
  const macPreview = scripts['package:mac:preview'];
  const winPreview = scripts['package:win:preview'];

  if (!macRelease || !macRelease.includes('verify-signing-env.mjs mac')) {
    throw new Error('Missing or incorrect `package:mac:release` wiring for signing env check.');
  }
  if (!macRelease.includes('electron-builder --mac dmg zip')) {
    throw new Error('Missing or incorrect `package:mac:release` electron-builder flags.');
  }

  if (!winRelease || !winRelease.includes('verify-signing-env.mjs win')) {
    throw new Error('Missing or incorrect `package:win:release` wiring for signing env check.');
  }
  if (!winRelease.includes('electron-builder --win nsis zip --x64')) {
    throw new Error('Missing or incorrect `package:win:release` electron-builder flags.');
  }

  // Unsigned previews must remain usable without signing env.
  if (!macPreview || macPreview.includes('verify-signing-env.mjs mac')) {
    throw new Error('`package:mac:preview` should not require signing env checks.');
  }
  if (!winPreview || winPreview.includes('verify-signing-env.mjs win')) {
    throw new Error('`package:win:preview` should not require signing env checks.');
  }
}

console.log('PASS release:gate');
