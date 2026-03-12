import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_PNG = 'D:/WINDOWS 11/Fuel_Order/icons8-horse-100.png';
const OUT_DIR = resolve(ROOT, 'public/icons');

mkdirSync(OUT_DIR, { recursive: true });

// All sizes needed for PWA (desktop + mobile + Apple)
const SIZES = [
  { size: 16,   name: 'favicon-16x16.png' },
  { size: 32,   name: 'favicon-32x32.png' },
  { size: 48,   name: 'favicon-48x48.png' },
  { size: 72,   name: 'icon-72x72.png' },
  { size: 96,   name: 'icon-96x96.png' },
  { size: 128,  name: 'icon-128x128.png' },
  { size: 144,  name: 'icon-144x144.png' },
  { size: 152,  name: 'icon-152x152.png' },
  { size: 167,  name: 'icon-167x167.png' },
  { size: 180,  name: 'apple-touch-icon.png' },
  { size: 192,  name: 'icon-192x192.png' },
  { size: 256,  name: 'icon-256x256.png' },
  { size: 384,  name: 'icon-384x384.png' },
  { size: 512,  name: 'icon-512x512.png' },
];

// Maskable icon needs safe-zone padding (logo fills ~80% of canvas)
const MASKABLE_SIZE = 512;
const MASKABLE_NAME = 'icon-512x512-maskable.png';

async function generateIcon(size, outName) {
  await sharp(SRC_PNG)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(resolve(OUT_DIR, outName));

  console.log(`✓ ${outName} (${size}x${size})`);
}

async function generateMaskable(size, outName) {
  // Maskable: 80% inner size with transparent padding for safe zone
  const innerSize = Math.round(size * 0.80);

  const rendered = await sharp(SRC_PNG)
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: rendered, gravity: 'centre' }])
    .png()
    .toFile(resolve(OUT_DIR, outName));

  console.log(`✓ ${outName} (maskable, ${size}x${size})`);
}

(async () => {
  console.log('Generating PWA icons from icons8-horse-100.png...\n');
  for (const { size, name } of SIZES) {
    await generateIcon(size, name);
  }
  await generateMaskable(MASKABLE_SIZE, MASKABLE_NAME);
  console.log('\nAll icons generated in public/icons/');
})();
