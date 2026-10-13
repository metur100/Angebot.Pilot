// Usage (needs @napi-rs/canvas, e.g. in a scratch folder: npm i @napi-rs/canvas@0.1.65):
//   node scripts/store-screenshots.mjs screenshots/android store-assets/android/phone-screenshots apps/api/src/AngebotPilot.Infrastructure/Pdf/Fonts
// Composes Google Play phone screenshots (1080x1920, opaque, 9:16) from real emulator screenshots.
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
const [, , srcDir, outDir, fontDir] = process.argv;
GlobalFonts.registerFromPath(`${fontDir}/Inter-Bold.ttf`, 'InterBold');
GlobalFonts.registerFromPath(`${fontDir}/Inter-Medium.ttf`, 'InterMedium');
mkdirSync(outDir, { recursive: true });
const shots = [
  ['dashboard', 'Alles auf einen Blick', 'Offene Angebote, Erinnerungen und Abschlussquote'],
  ['quotation-editor', 'Angebote in Minuten', 'Positionen, Rabatte und USt. – automatisch berechnet'],
  ['quotation-details', 'Nachfassen automatisch', 'Erinnerungen, Versand und Verlauf im Blick'],
  ['quotation-list', 'Jeder Status im Griff', 'Entwurf, versendet, angenommen, abgelaufen'],
  ['customers', 'Kunden im Überblick', 'Kontakte, Angebote und Aufträge je Kunde'],
  ['jobs', 'Aus Zusagen werden Aufträge', 'Termine, Zuständige und Status'],
];
const W = 1080, H = 1920;
let i = 1;
for (const [name, title, subtitle] of shots) {
  const img = await loadImage(`${srcDir}/${name}.png`);
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2F45D8'); g.addColorStop(1, '#2537B0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center';
  ctx.font = '64px InterBold'; ctx.fillText(title, W / 2, 150);
  ctx.fillStyle = '#E0E7FF'; ctx.font = '34px InterMedium'; ctx.fillText(subtitle, W / 2, 210);
  const h = 1600, w = Math.round(img.width * h / img.height), x = (W - w) / 2, y = 290, r = 44;
  ctx.save();
  ctx.shadowColor = 'rgba(10,16,60,0.45)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip(); ctx.drawImage(img, x, y, w, h); ctx.restore();
  const out = `${outDir}/phone-${String(i++).padStart(2, '0')}-${name}.jpg`;
  // Flatten: JPEG-like opaque PNG (no alpha channel) by re-drawing onto an opaque context.
  writeFileSync(out, c.toBuffer('image/jpeg', 92));
  console.log(out);
}
