// Usage (needs @napi-rs/canvas, e.g. in a scratch folder: npm i @napi-rs/canvas@0.1.65):
//   node scripts/store-screenshots.mjs <srcDir> <outDir> <fontDir> [phone|tablet-7|tablet-10]
//   e.g. node scripts/store-screenshots.mjs screenshots/android store-assets/android/phone-screenshots apps/api/src/AngebotPilot.Infrastructure/Pdf/Fonts phone
//        node scripts/store-screenshots.mjs screenshots/android/tablet-7 store-assets/android/tablet-7-screenshots apps/api/src/AngebotPilot.Infrastructure/Pdf/Fonts tablet-7
// Composes Google Play screenshots (opaque JPEG, 9:16 portrait) from real emulator screenshots of the release build,
// logged in with the demo company (Berkcan Malerbetrieb GmbH). Missing source files are skipped.
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const [, , srcDir, outDir, fontDir, profile = 'phone'] = process.argv;
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

// Output sizes: all 9:16 (Play: phone long side ≤ 2× short side; tablets 16:9 or 9:16, sides ≥ 1080 px).
const sizes = { phone: [1080, 1920], 'tablet-7': [1200, 2134], 'tablet-10': [1620, 2880] };
const [W, H] = sizes[profile] ?? sizes.phone;
const s = W / 1080; // scale typography and layout with the canvas width

let i = 1;
for (const [name, title, subtitle] of shots) {
  const file = `${srcDir}/${name}.png`;
  if (!existsSync(file)) continue;
  const img = await loadImage(file);
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2F45D8'); g.addColorStop(1, '#2537B0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center';
  ctx.font = `${Math.round(64 * s)}px InterBold`; ctx.fillText(title, W / 2, 150 * s);
  ctx.fillStyle = '#E0E7FF'; ctx.font = `${Math.round(34 * s)}px InterMedium`; ctx.fillText(subtitle, W / 2, 210 * s);
  const top = 290 * s, maxH = H - top - 30 * s, maxW = W - 80 * s;
  let h = maxH, w = Math.round(img.width * h / img.height);
  if (w > maxW) { w = maxW; h = Math.round(img.height * w / img.width); }
  const x = (W - w) / 2, y = top, r = 44 * s;
  ctx.save();
  ctx.shadowColor = 'rgba(10,16,60,0.45)'; ctx.shadowBlur = 50 * s; ctx.shadowOffsetY = 18 * s;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip(); ctx.drawImage(img, x, y, w, h); ctx.restore();
  const prefix = profile === 'phone' ? 'phone' : profile;
  const out = `${outDir}/${prefix}-${String(i++).padStart(2, '0')}-${name}.jpg`;
  writeFileSync(out, c.toBuffer('image/jpeg', 92)); // JPEG: opaque, no alpha channel
  console.log(out, `${W}x${H}`);
}
