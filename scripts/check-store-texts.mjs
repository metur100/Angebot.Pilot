// Counts the characters of every length-limited store text and fails when one is over its limit.
//   node scripts/check-store-texts.mjs [file.md ...]
// Default files: store-assets/android/GOOGLE-PLAY-CONSOLE.md and docs/store-listings/apple-app-store.md.
// A limited field is a Markdown line containing "(max N)" followed by a ```text block; the count is in Unicode code
// points (what Play Console and App Store Connect count), without the final newline of the block.
// Apple keywords (a field whose label contains "Keywords") are also checked for spaces after commas.
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) files.push('store-assets/android/GOOGLE-PLAY-CONSOLE.md', 'docs/store-listings/apple-app-store.md');

let failed = false;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  let section = '';
  console.log(`\n${file}`);
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,4} /.test(lines[i])) section = lines[i].replace(/^#+ /, '');
    const m = lines[i].match(/^(.*)\(max (\d+)\)/);
    if (!m) continue;
    const start = lines.findIndex((l, j) => j > i && l.startsWith('```'));
    if (start < 0 || start > i + 2) continue; // the block must follow the label directly
    const end = lines.findIndex((l, j) => j > start && l.startsWith('```'));
    const text = lines.slice(start + 1, end).join('\n');
    const count = [...text].length;
    const limit = Number(m[2]);
    const label = `${section} › ${m[1].replace(/[:*`]/g, '').trim()}`;
    let note = count > limit ? '  OVER LIMIT' : '';
    if (/keywords/i.test(label) && /,\s/.test(text)) note += '  (space after comma)';
    if (note) failed = true;
    console.log(`  ${String(count).padStart(4)} / ${String(limit).padEnd(4)} ${label}${note}`);
  }
}
process.exit(failed ? 1 : 0);
