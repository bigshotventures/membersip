import 'server-only';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

// Standard PDF fonts can't draw "₹", so PDFs use "Rs."
const rs = (p: number) => 'Rs. ' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = (s: any) => String(s ?? '').replace(/[^\x20-\x7E]/g, '?');

/** Stamp every page with the buyer's identity (footer + faint diagonal watermark). */
export async function stampPdf(bytes: Uint8Array, label: string) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const text = safe(label);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(`Licensed to ${text}`, { x: 24, y: 14, size: 8, font, color: rgb(0.45, 0.45, 0.45) });
    page.drawText(text, {
      x: width * 0.15, y: height * 0.35, size: Math.min(36, width / 18), font,
      color: rgb(0.6, 0.6, 0.6), opacity: 0.12, rotate: degrees(35),
    });
  }
  doc.setProducer('CreatorHub');
  return doc.save();
}

export async function invoicePdf(inv: any) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const t = (s: string, x: number, size = 10, f = font) => page.drawText(safe(s), { x, y, size, font: f, color: rgb(0.1, 0.1, 0.12) });

  t('TAX INVOICE', 40, 18, bold); y -= 26;
  t(`Invoice no: ${inv.invoice_number}`, 40); t(`Date: ${new Date(inv.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 380); y -= 30;

  t('Supplier', 40, 11, bold); t('Bill to', 320, 11, bold); y -= 16;
  const s = inv.seller, b = inv.buyer;
  const left = [s.name, s.address, s.gstin ? `GSTIN: ${s.gstin}` : '', `State code: ${s.state_code}`].filter(Boolean);
  const right = [b.name, b.email, b.phone, b.state_code ? `State code: ${b.state_code}` : '', b.gstin ? `GSTIN: ${b.gstin}` : ''].filter(Boolean);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i]) t(String(left[i]).slice(0, 55), 40);
    if (right[i]) t(String(right[i]).slice(0, 45), 320);
    y -= 14;
  }
  y -= 16;
  page.drawRectangle({ x: 40, y: y - 6, width: 515, height: 22, color: rgb(0.95, 0.95, 0.97) });
  t('Description', 48, 10, bold); t('SAC', 330, 10, bold); t('Taxable value', 440, 10, bold); y -= 26;
  t(inv.line_description.slice(0, 55), 48); t('999293', 330); t(rs(inv.taxable_paise), 440); y -= 30;

  const rows: [string, number][] = [['Taxable value', inv.taxable_paise]];
  if (inv.cgst_paise) rows.push([`CGST`, inv.cgst_paise], [`SGST`, inv.sgst_paise]);
  if (inv.igst_paise) rows.push([`IGST`, inv.igst_paise]);
  for (const [k, v] of rows) { t(k, 330); t(rs(v), 440); y -= 16; }
  page.drawLine({ start: { x: 320, y: y + 6 }, end: { x: 555, y: y + 6 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 6; t('Total', 330, 12, bold); t(rs(inv.total_paise), 440, 12, bold); y -= 40;
  t(`Place of supply: ${inv.place_of_supply || s.state_code}`, 40); y -= 14;
  t('This is a computer-generated invoice and does not require a signature.', 40, 8);
  return doc.save();
}

export async function certificatePdf(o: { name: string; course: string; creator: string; serial: string; date: string; accent?: string }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const hex = (o.accent || '#7c3aed').replace('#', '');
  const color = rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
  page.drawRectangle({ x: 24, y: 24, width: 794, height: 547, borderColor: color, borderWidth: 4 });
  const center = (s: string, y: number, size: number, f = font, c = rgb(0.1, 0.1, 0.12)) => {
    const txt = safe(s); const w = f.widthOfTextAtSize(txt, size);
    page.drawText(txt, { x: (842 - w) / 2, y, size, font: f, color: c });
  };
  center('CERTIFICATE OF COMPLETION', 470, 26, bold, color);
  center('This certifies that', 410, 14);
  center(o.name, 360, 34, bold);
  center('has successfully completed', 315, 14);
  center(o.course, 270, 24, bold);
  center(`by ${o.creator}`, 235, 14);
  center(`Issued ${o.date}  ·  Certificate ID ${o.serial}`, 90, 10);
  return doc.save();
}
