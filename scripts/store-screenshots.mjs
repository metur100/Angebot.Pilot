// Usage (needs @napi-rs/canvas, e.g. in a scratch folder: npm i @napi-rs/canvas@0.1.65, then run with
// NODE_PATH=<scratch>/node_modules or copy this file next to it):
//   node scripts/store-screenshots.mjs <srcDir> <outDir> <fontDir> [profile] [cropTop] [cropBottom]
//   profiles: phone | tablet-7 | tablet-10 (Google Play) · iphone-6.9 | iphone-6.3 | ipad-13 (App Store)
//   e.g. node scripts/store-screenshots.mjs screenshots/android store-assets/android/phone-screenshots apps/api/src/AngebotPilot.Infrastructure/Pdf/Fonts phone
//        node scripts/store-screenshots.mjs screenshots/ios/iphone store-assets/ios/iphone-6.9 apps/api/src/AngebotPilot.Infrastructure/Pdf/Fonts iphone-6.9 132 72
// cropTop / cropBottom (source pixels) cut the Android status bar and navigation bar off the raw capture – required
// for the App Store sets, which must not show Android system UI.
// Composes store screenshots (opaque JPEG, no alpha) from real emulator screenshots of the release build, logged in with
// the demo company (Berkcan Malerbetrieb GmbH). Missing source files are skipped.
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const [, , srcDir, outDir, fontDir, profile = 'phone', cropTopArg = '0', cropBottomArg = '0'] = process.argv;
const cropTop = Number(cropTopArg), cropBottom = Number(cropBottomArg);
GlobalFonts.registerFromPath(`${fontDir}/Inter-Bold.ttf`, 'InterBold');
GlobalFonts.registerFromPath(`${fontDir}/Inter-Medium.ttf`, 'InterMedium');
mkdirSync(outDir, { recursive: true });

const shots = [
  ['dashboard', 'Alles auf einen Blick', 'Offene Angebote, Rechnungen und Erinnerungen'],
  ['quotation-list', 'Jeder Status im Griff', 'Entwurf, versendet, angenommen, abgelehnt'],
  ['quotation-details', 'Nachfassen automatisch', 'Kundenlink, PDF und Erinnerungen im Blick'],
  ['quotation-editor', 'Angebote in Minuten', 'Positionen, Rabatte und USt. – automatisch berechnet'],
  ['jobs', 'Aus Zusagen werden Aufträge', 'Termine, Zuständige und Status'],
  ['invoices', 'Rechnungen und Zahlungen', 'E-Rechnung, Teilzahlungen, Überfälliges'],
  ['customers', 'Kunden im Überblick', 'Geschäfts- und Privatkunden mit Historie'],
  ['dashboard-dark', 'Auch im Dunkelmodus', 'Deutsch oder Englisch, hell oder dunkel'],
];

// Output sizes. Play: 9:16 (phone long side ≤ 2× short side; tablets 16:9 or 9:16, sides ≥ 1080 px).
// App Store: exact pixel sizes per display class (portrait).
const sizes = {
  phone: [1080, 1920],
  'tablet-7': [1200, 2134],
  'tablet-10': [1620, 2880],
  'iphone-6.9': [1320, 2868],
  'iphone-6.3': [1206, 2622],
  'ipad-13': [2064, 2752],
};
if (!sizes[profile]) throw new Error(`unknown profile ${profile}`);
const [W, H] = sizes[profile];
const s = W / 1080; // scale typography and layout with the canvas width
// iPad is much wider than tall compared to phones: scale captions by height instead so they stay proportionate.
const t = profile === 'ipad-13' ? H / 1920 : s;

let i = 1;
for (const [name, title, subtitle] of shots) {
  const file = `${srcDir}/${name}.png`;
  if (!existsSync(file)) continue;
  const img = await loadImage(file);
  const srcH = img.height - cropTop - cropBottom;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2F45D8'); g.addColorStop(1, '#2537B0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center';
  ctx.font = `${Math.round(64 * t)}px InterBold`; ctx.fillText(title, W / 2, 150 * t);
  ctx.fillStyle = '#E0E7FF'; ctx.font = `${Math.round(34 * t)}px InterMedium`; ctx.fillText(subtitle, W / 2, 210 * t);
  const top = 290 * t, maxH = H - top - 30 * t, maxW = W - 80 * s;
  let h = maxH, w = Math.round(img.width * h / srcH);
  if (w > maxW) { w = maxW; h = Math.round(srcH * w / img.width); }
  const x = (W - w) / 2, y = top, r = 44 * t;
  ctx.save();
  ctx.shadowColor = 'rgba(10,16,60,0.45)'; ctx.shadowBlur = 50 * t; ctx.shadowOffsetY = 18 * t;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip();
  ctx.drawImage(img, 0, cropTop, img.width, srcH, x, y, w, h);
  ctx.restore();
  const out = `${outDir}/${profile}-${String(i++).padStart(2, '0')}-${name}.jpg`;
  writeFileSync(out, c.toBuffer('image/jpeg', 92)); // JPEG: opaque, no alpha channel
  console.log(out, `${W}x${H}`);
}
