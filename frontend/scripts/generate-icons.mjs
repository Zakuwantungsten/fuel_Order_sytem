import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_PNG = 'D:/WINDOWS 11/Fuel_Order/icons8-horse-100.png';
const OUT_DIR = resolve(ROOT, 'public/icons');
const CARD_FILL = { r: 255, g: 255, b: 255, alpha: 1 };
const CARD_STROKE = { r: 15, g: 23, b: 42, alpha: 0.14 };

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

function createRoundedCard(size, inset = 0, radiusRatio = 0.22) {
  const cardSize = size - inset * 2;
  const radius = Math.round(cardSize * radiusRatio);
  const strokeWidth = Math.max(1, Math.round(size * 0.02));

  return Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="${inset + strokeWidth / 2}"
        y="${inset + strokeWidth / 2}"
        width="${cardSize - strokeWidth}"
        height="${cardSize - strokeWidth}"
        rx="${radius}"
        fill="rgba(${CARD_FILL.r}, ${CARD_FILL.g}, ${CARD_FILL.b}, ${CARD_FILL.alpha})"
        stroke="rgba(${CARD_STROKE.r}, ${CARD_STROKE.g}, ${CARD_STROKE.b}, ${CARD_STROKE.alpha})"
        stroke-width="${strokeWidth}"
      />
    </svg>
  `);
}

async function renderMark(size) {
  const markScale = size <= 48 ? 0.78 : size <= 96 ? 0.74 : 0.68;
  const markSize = Math.round(size * markScale);

  return sharp(SRC_PNG)
    .resize(markSize, markSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function generateIcon(size, outName) {
  const card = createRoundedCard(size);
  const mark = await renderMark(size);

  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: card },
      { input: mark, gravity: 'centre' },
    ])
    .png()
    .toFile(resolve(OUT_DIR, outName));

  console.log(`✓ ${outName} (${size}x${size})`);
}

async function generateMaskable(size, outName) {
  const card = createRoundedCard(size, Math.round(size * 0.04), 0.2);
  const mark = await renderMark(Math.round(size * 1.08));

  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: card },
      { input: mark, gravity: 'centre' },
    ])
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
