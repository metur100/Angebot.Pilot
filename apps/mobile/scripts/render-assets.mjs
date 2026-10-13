// Renders the app icons, splash icon and store artwork from the brand SVGs in packages/brand/assets.
// Usage: npm run assets   (dev deps: @resvg/resvg-js, sharp)
//
// Outputs
//   apps/mobile/assets/images/icon.png                     1024×1024, opaque (Expo app icon, iOS + legacy Android)
//   apps/mobile/assets/images/adaptive-icon.png            1024×1024, transparent foreground (Android adaptive icon)
//   apps/mobile/assets/images/adaptive-icon-monochrome.png 1024×1024, single-colour foreground (Android 13 themed icon)
//   apps/mobile/assets/images/splash-icon.png              1024×1024, transparent (splash on brand background)
//   store-assets/android/icon-512.png                      512×512, 32-bit PNG (Google Play)
//   store-assets/android/feature-graphic-1024x500.png      1024×500, 24-bit PNG without alpha (Google Play)
//   store-assets/ios/app-icon-1024.png                     1024×1024, opaque, no alpha channel (App Store)
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appRoot, '..', '..');
const brandDir = join(repoRoot, 'packages', 'brand', 'assets');
const imagesDir = join(appRoot, 'assets', 'images');
const androidStoreDir = join(repoRoot, 'store-assets', 'android');
const iosStoreDir = join(repoRoot, 'store-assets', 'ios');
for (const dir of [imagesDir, androidStoreDir, iosStoreDir]) mkdirSync(dir, { recursive: true });

const BRAND = '#2F45D8';
const iconSvg = readFileSync(join(brandDir, 'icon.svg'), 'utf8');
const foregroundSvg = readFileSync(join(brandDir, 'icon-foreground.svg'), 'utf8');

/** The glyph paths of the brand icon (everything except the rounded background rect). */
const glyph = iconSvg.replace(/^[\s\S]*?<rect[^>]*\/>/, '').replace(/<\/svg>\s*$/, '').trim();

/** Full-bleed square icon: stores and iOS apply their own corner masks, so the background must not be rounded. */
const squareIconSvg = iconSvg.replace(/<rect[^>]*\/>/, `<rect width="1024" height="1024" fill="${BRAND}"/>`);

/** Monochrome (themed) icon: Android only uses the alpha channel; keep the fold as lower opacity. */
const monochromeSvg = foregroundSvg
  .replace('fill="#FFFFFF"', 'fill="#FFFFFF" fill-opacity="1"')
  .replace('fill="#C7D2FE"', 'fill="#FFFFFF" fill-opacity="0.7"')
  .replace('fill="#A5B4FC"', 'fill="#FFFFFF" fill-opacity="0.5"');

function render(svg, width) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
  });
  return resvg.render().asPng();
}

async function write(name, buffer, { opaque = false, alpha = false } = {}) {
  let img = sharp(buffer);
  if (opaque) img = img.flatten({ background: BRAND }).removeAlpha();
  if (alpha) img = img.ensureAlpha();
  await img.png({ compressionLevel: 9 }).toFile(name);
  const meta = await sharp(name).metadata();
  console.log(`${name.replace(repoRoot, '').replace(/\\/g, '/')}  ${meta.width}×${meta.height}  channels=${meta.channels}  alpha=${meta.hasAlpha}`);
  return meta;
}

// Feature graphic: brand background, logo mark, product name and the German tagline. No UI mock-ups.
const featureSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2F45D8"/>
      <stop offset="1" stop-color="#1F2E8A"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <circle cx="930" cy="70" r="220" fill="#4F63F0" fill-opacity="0.25"/>
  <circle cx="980" cy="470" r="160" fill="#7C8CF8" fill-opacity="0.18"/>
  <g transform="translate(72 146) scale(0.2)">
    <rect width="1024" height="1024" rx="224" fill="#FFFFFF" fill-opacity="0.12"/>
    ${glyph}
  </g>
  <text x="302" y="232" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="72" font-weight="700" fill="#FFFFFF" letter-spacing="-1">AngebotPilot</text>
  <text x="304" y="296" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="30" font-weight="400" fill="#E0E7FF">Angebote erstellen, nachfassen,</text>
  <text x="304" y="338" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="30" font-weight="400" fill="#E0E7FF">Aufträge gewinnen.</text>
</svg>`;

const results = [];
results.push(['icon.png', await write(join(imagesDir, 'icon.png'), render(squareIconSvg, 1024), { opaque: true }), 1024, 1024]);
results.push(['adaptive-icon.png', await write(join(imagesDir, 'adaptive-icon.png'), render(foregroundSvg, 1024), { alpha: true }), 1024, 1024]);
results.push(['adaptive-icon-monochrome.png', await write(join(imagesDir, 'adaptive-icon-monochrome.png'), render(monochromeSvg, 1024), { alpha: true }), 1024, 1024]);
results.push(['splash-icon.png', await write(join(imagesDir, 'splash-icon.png'), render(foregroundSvg, 1024), { alpha: true }), 1024, 1024]);
results.push(['icon-512.png', await write(join(androidStoreDir, 'icon-512.png'), render(squareIconSvg, 512), { alpha: true }), 512, 512]);
results.push(['feature-graphic-1024x500.png', await write(join(androidStoreDir, 'feature-graphic-1024x500.png'), render(featureSvg, 1024), { opaque: true }), 1024, 500]);
results.push(['app-icon-1024.png', await write(join(iosStoreDir, 'app-icon-1024.png'), render(squareIconSvg, 1024), { opaque: true }), 1024, 1024]);

// Verify dimensions and channel requirements programmatically.
const failures = [];
for (const [name, meta, w, h] of results) {
  if (meta.width !== w || meta.height !== h) failures.push(`${name}: expected ${w}×${h}, got ${meta.width}×${meta.height}`);
}
const byName = Object.fromEntries(results.map(([n, m]) => [n, m]));
if (byName['app-icon-1024.png'].hasAlpha) failures.push('app-icon-1024.png must not have an alpha channel');
if (byName['icon.png'].hasAlpha) failures.push('icon.png must be opaque');
if (byName['feature-graphic-1024x500.png'].hasAlpha) failures.push('feature graphic must be 24-bit without alpha');
if (byName['icon-512.png'].channels !== 4) failures.push('icon-512.png must be a 32-bit PNG');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('All assets verified.');
