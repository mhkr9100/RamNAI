import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const assetsDir = path.join(__dirname, '..', 'assets');
const inputSvgPath = path.join(assetsDir, 'icon.svg');
const outputPngPath = path.join(assetsDir, 'icon.png');

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

console.log(`[icon-gen] Wrote ${path.relative(process.cwd(), outputPngPath)}`);

