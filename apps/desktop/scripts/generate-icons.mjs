import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

const assetsDir = path.join(__dirname, '..', 'assets');
const inputSvgPath = path.join(assetsDir, 'icon.svg');
const outputPngPath = path.join(assetsDir, 'icon.png');
const outputIcnsPath = path.join(assetsDir, 'icon.icns');
const outputIcoPath = path.join(assetsDir, 'icon.ico');
const iconsetDir = path.join(assetsDir, 'icon.iconset');

if (!fs.existsSync(inputSvgPath)) {
  throw new Error(`Icon SVG not found at: ${inputSvgPath}`);
}

// electron-builder can generate .icns/.ico from a PNG icon source.
// We render the repo SVG into a high-resolution PNG once during packaging.
const svgBuffer = fs.readFileSync(inputSvgPath);

await sharp(svgBuffer)
  .png()
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toFile(outputPngPath);

const iconsetSizes = [
  16,
  32,
  64,
  128,
  256,
  512,
];

fs.rmSync(iconsetDir, { recursive: true, force: true });
fs.mkdirSync(iconsetDir, { recursive: true });

for (const size of iconsetSizes) {
  const normalPath = path.join(iconsetDir, `icon_${size}x${size}.png`);
  const retinaPath = path.join(iconsetDir, `icon_${size}x${size}@2x.png`);

  await sharp(svgBuffer)
    .png()
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(normalPath);

  await sharp(svgBuffer)
    .png()
    .resize(size * 2, size * 2, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(retinaPath);
}

try {
  await execFileAsync('iconutil', ['-c', 'icns', iconsetDir, '-o', outputIcnsPath]);
  console.log(`[icon-gen] Wrote ${path.relative(process.cwd(), outputIcnsPath)}`);
} catch (error) {
  console.warn('[icon-gen] Skipped .icns generation:', error instanceof Error ? error.message : String(error));
}

try {
  await execFileAsync('python3', ['-c', [
    'from PIL import Image',
    `img = Image.open(r"""${outputPngPath}""")`,
    `img.save(r"""${outputIcoPath}""", format="ICO", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])`,
  ].join('; ')]);
  console.log(`[icon-gen] Wrote ${path.relative(process.cwd(), outputIcoPath)}`);
} catch (error) {
  console.warn('[icon-gen] Skipped .ico generation:', error instanceof Error ? error.message : String(error));
}

console.log(`[icon-gen] Wrote ${path.relative(process.cwd(), outputPngPath)}`);

