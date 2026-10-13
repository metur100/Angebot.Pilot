// Tiny hand-written PDF 1.4 generator for the mock backend (Helvetica, A4, WinAnsiEncoding).
// Produces a valid file with a correct xref table so pdf.js and browser viewers can render it.
import { calculateTotals, formatDate, formatEur, formatPercent, formatQuantity } from '@angebotpilot/api-contracts';
import type { CompanyRec, QuotationRec } from './model';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 545;
const BOTTOM_LIMIT = 90;

// Unicode → WinAnsi (cp1252) for the characters outside Latin-1 that German documents use.
const WIN_ANSI_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99,
};

function winAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const extra = WIN_ANSI_EXTRA[ch];
    if (extra !== undefined) {
      out.push(extra);
      continue;
    }
    const code = ch.codePointAt(0) ?? 63;
    if (code === 0x202f) out.push(0x20); // narrow no-break space (Intl currency formatting)
    else if (code < 256) out.push(code);
    else out.push(63); // '?'
  }
  return out;
}

/** Escapes a WinAnsi byte string for a PDF literal string. */
function pdfString(text: string): string {
  let s = '';
  for (const b of winAnsi(text)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) s += `\\${b.toString(8).padStart(3, '0')}`;
    else s += String.fromCharCode(b);
  }
  return `(${s})`;
}

/** Approximate Helvetica text width (good enough for right alignment of numbers and wrapping). */
function textWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const ch of text) {
    if (/[0-9]/.test(ch)) units += 556;
    else if (ch === '.' || ch === ',' || ch === ' ' || ch === ' ' || ch === 'i' || ch === 'l' || ch === 'j') units += 278;
    else if (ch === '€') units += 556;
    else if (/[A-Z]/.test(ch)) units += 667;
    else if (/[mwMW]/.test(ch)) units += 833;
    else units += 520;
  }
  return (units / 1000) * size * (bold ? 1.05 : 1);
}

function wrap(text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (textWidth(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return [0.18, 0.27, 0.85];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

class PageWriter {
  pages: string[] = [];
  private ops: string[] = [];
  y = PAGE_HEIGHT - 60;

  constructor(private readonly onNewPage: (w: PageWriter) => void) {
    this.onNewPage(this);
  }

  text(x: number, y: number, text: string, size = 10, bold = false, gray = 0): void {
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${gray} g ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(text)} Tj ET`);
  }

  textRight(xRight: number, y: number, text: string, size = 10, bold = false): void {
    this.text(xRight - textWidth(text, size, bold), y, text, size, bold);
  }

  raw(op: string): void {
    this.ops.push(op);
  }

  line(x1: number, y1: number, x2: number, y2: number, gray = 0.75): void {
    this.ops.push(`${gray} G 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  ensure(space: number): void {
    if (this.y - space < BOTTOM_LIMIT) this.newPage();
  }

  newPage(): void {
    this.flush();
    this.y = PAGE_HEIGHT - 60;
    this.onNewPage(this);
  }

  flush(): void {
    if (this.ops.length > 0) this.pages.push(this.ops.join('\n'));
    this.ops = [];
  }
}

export interface QuotationPdfModel {
  company: CompanyRec;
  quotation: QuotationRec;
  draft: boolean;
}

export function quotationPdfFileName(q: QuotationRec): string {
  return `Angebot_${q.number}.pdf`;
}

export function buildQuotationPdf({ company, quotation: q, draft }: QuotationPdfModel): Uint8Array<ArrayBuffer> {
  const [r, g, b] = hexToRgb(company.brandColor);
  const companyLine = [company.name, company.addressLine1, [company.postalCode, company.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  let pageNo = 0;

  const w = new PageWriter((p) => {
    pageNo += 1;
    p.raw(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 0 ${PAGE_HEIGHT - 12} ${PAGE_WIDTH} 12 re f`);
    if (draft) p.text(MARGIN_LEFT, PAGE_HEIGHT - 34, 'ENTWURF – nicht versendet', 11, true, 0.55);
    p.text(MARGIN_LEFT, 40, `${companyLine}`, 7, false, 0.4);
    p.textRight(MARGIN_RIGHT, 40, `Seite ${pageNo}`, 7);
    if (pageNo > 1) {
      p.text(MARGIN_LEFT, PAGE_HEIGHT - 50, `Angebot ${q.number} (Fortsetzung)`, 9, true);
      p.y = PAGE_HEIGHT - 75;
    }
  });

  // Header: company
  w.text(MARGIN_LEFT, w.y, company.name, 16, true);
  w.y -= 16;
  for (const line of [companyLine, [company.phone, company.email, company.website].filter(Boolean).join(' · ')]) {
    if (line) {
      w.text(MARGIN_LEFT, w.y, line, 8, false, 0.35);
      w.y -= 11;
    }
  }

  // Recipient and meta block
  w.y -= 18;
  const metaTop = w.y;
  const recipientLines = [q.recipientName, q.recipientContact ? `z. Hd. ${q.recipientContact}` : null, ...(q.recipientAddress ?? '').split('\n')].filter(
    (l): l is string => !!l && l.trim() !== '',
  );
  for (const line of recipientLines) {
    w.text(MARGIN_LEFT, w.y, line, 10);
    w.y -= 13;
  }
  const meta: [string, string][] = [
    ['Angebotsnummer', q.number],
    ['Datum', formatDate(q.issueDate)],
    ['Gültig bis', formatDate(q.validUntil)],
  ];
  if (q.recipientVatId) meta.push(['USt-IdNr. Kunde', q.recipientVatId]);
  let my = metaTop;
  for (const [label, value] of meta) {
    w.text(360, my, label, 9, false, 0.35);
    w.textRight(MARGIN_RIGHT, my, value, 9, true);
    my -= 13;
  }
  w.y = Math.min(w.y, my) - 22;

  // Title
  w.text(MARGIN_LEFT, w.y, `Angebot ${q.number}`, 14, true);
  w.y -= 18;
  for (const line of wrap(q.title, 11, MARGIN_RIGHT - MARGIN_LEFT)) {
    w.text(MARGIN_LEFT, w.y, line, 11);
    w.y -= 14;
  }
  w.y -= 6;
  if (q.introText) {
    for (const line of wrap(q.introText, 9, MARGIN_RIGHT - MARGIN_LEFT)) {
      w.ensure(12);
      w.text(MARGIN_LEFT, w.y, line, 9);
      w.y -= 12;
    }
    w.y -= 8;
  }

  // Line items
  const header = () => {
    w.ensure(30);
    w.text(MARGIN_LEFT, w.y, 'Pos.', 8, true);
    w.text(80, w.y, 'Bezeichnung', 8, true);
    w.textRight(360, w.y, 'Menge', 8, true);
    w.text(366, w.y, 'Einheit', 8, true);
    w.textRight(470, w.y, 'Einzelpreis', 8, true);
    w.textRight(MARGIN_RIGHT, w.y, 'Gesamt netto', 8, true);
    w.y -= 6;
    w.line(MARGIN_LEFT, w.y, MARGIN_RIGHT, w.y, 0.3);
    w.y -= 13;
  };
  header();
  for (const item of q.lineItems) {
    const titleLines = wrap(item.title, 9, 250);
    const descLines = item.description ? wrap(item.description, 8, 250) : [];
    const discount = item.discountPercent > 0 ? [`abzgl. ${formatPercent(item.discountPercent)} Rabatt`] : [];
    const height = (titleLines.length + descLines.length + discount.length) * 11 + 6;
    if (w.y - height < BOTTOM_LIMIT) {
      w.newPage();
      header();
    }
    w.text(MARGIN_LEFT, w.y, String(item.position), 9);
    w.textRight(360, w.y, formatQuantity(item.quantity), 9);
    w.text(366, w.y, item.unit, 9);
    w.textRight(470, w.y, formatEur(item.unitPriceNet), 9);
    w.textRight(MARGIN_RIGHT, w.y, formatEur(item.lineNet), 9);
    let ly = w.y;
    for (const line of titleLines) {
      w.text(80, ly, line, 9);
      ly -= 11;
    }
    for (const line of [...descLines, ...discount]) {
      w.text(80, ly, line, 8, false, 0.4);
      ly -= 11;
    }
    w.y = ly - 4;
  }

  // Totals
  const totals = calculateTotals(q.lineItems, q.taxMode);
  w.ensure(110);
  w.line(330, w.y + 6, MARGIN_RIGHT, w.y + 6, 0.3);
  w.y -= 8;
  const totalRow = (label: string, value: string, bold = false, size = 9) => {
    w.text(330, w.y, label, size, bold);
    w.textRight(MARGIN_RIGHT, w.y, value, size, bold);
    w.y -= size + 5;
  };
  if (totals.discountTotal > 0) {
    totalRow('Zwischensumme', formatEur(totals.subtotalBeforeDiscount));
    totalRow('Rabatte', `– ${formatEur(totals.discountTotal)}`);
  }
  totalRow('Summe netto', formatEur(totals.netTotal));
  if (q.taxMode === 'Standard') {
    for (const group of totals.taxGroups) totalRow(`zzgl. ${formatPercent(group.ratePercent)} USt.`, formatEur(group.taxAmount));
  }
  w.y -= 2;
  totalRow('Gesamtbetrag brutto', formatEur(totals.grossTotal), true, 11);
  if (q.taxMode === 'SmallBusiness') {
    w.text(MARGIN_LEFT, w.y, 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', 8, false, 0.35);
    w.y -= 12;
  } else if (q.taxMode === 'ReverseCharge') {
    w.text(MARGIN_LEFT, w.y, 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).', 8, false, 0.35);
    w.y -= 12;
  }

  // Texts
  w.y -= 10;
  for (const block of [q.closingText, q.paymentTerms ? `Zahlungsbedingungen: ${q.paymentTerms}` : null, q.terms]) {
    if (!block) continue;
    for (const line of wrap(block, 8.5, MARGIN_RIGHT - MARGIN_LEFT)) {
      w.ensure(12);
      w.text(MARGIN_LEFT, w.y, line, 8.5, false, 0.15);
      w.y -= 11;
    }
    w.y -= 6;
  }
  const s = company.settings;
  if (s.showBankDetails && s.iban) {
    w.ensure(14);
    w.text(MARGIN_LEFT, w.y, `Bankverbindung: ${s.bankAccountHolder ?? company.name} · IBAN ${s.iban}${s.bic ? ` · BIC ${s.bic}` : ''}${s.bankName ? ` · ${s.bankName}` : ''}`, 7.5, false, 0.35);
    w.y -= 11;
  }
  w.flush();

  return assemblePdf(w.pages);
}

/** Assembles page content streams into a complete PDF with a byte-exact xref table. */
export function assemblePdf(pageContents: string[]): Uint8Array<ArrayBuffer> {
  const chunks: number[][] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (bytes: number[]) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0) & 0xff);
  const object = (id: number, body: string) => {
    offsets[id] = length;
    push(ascii(`${id} 0 obj\n${body}\nendobj\n`));
  };

  const pages = pageContents.length > 0 ? pageContents : [''];
  const fontRegular = 3;
  const fontBold = 4;
  const firstPageId = 5;
  const pageIds = pages.map((_, i) => firstPageId + i * 2);

  push(ascii('%PDF-1.4\n'));
  push([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]); // binary marker comment
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  object(fontRegular, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  object(fontBold, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pages.forEach((content, i) => {
    const pageId = firstPageId + i * 2;
    const contentId = pageId + 1;
    object(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    // Content streams only contain ASCII (strings are octal-escaped), so length in chars == bytes.
    offsets[contentId] = length;
    push(ascii(`${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`));
  });
  const size = firstPageId + pages.length * 2;
  const xrefOffset = length;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id++) xref += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  push(ascii(`${xref}trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));

  const out = new Uint8Array(length);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
