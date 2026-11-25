import { NextResponse } from 'next/server';
import { getProfile, isStaff } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { toCSV } from '@/lib/csv';

export async function GET(req: Request) {
  const p = await getProfile();
  if (!isStaff(p)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const month = new URL(req.url).searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const start = new Date(`${month}-01T00:00:00+05:30`);
  const end = new Date(start); end.setMonth(end.getMonth() + 1);
  const { data } = await admin().from('invoices').select('*, creator:creators(name)').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).order('created_at');
  const rows = (data || []).map((i: any) => ({
    invoice_number: i.invoice_number, date: new Date(i.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
    type: i.buyer?.gstin ? 'B2B' : 'B2C', buyer_name: i.buyer?.name, buyer_gstin: i.buyer?.gstin || '', place_of_supply: i.place_of_supply,
    sac: '999293', description: i.line_description, creator: i.creator?.name, taxable_value: i.taxable_paise / 100,
    cgst: i.cgst_paise / 100, sgst: i.sgst_paise / 100, igst: i.igst_paise / 100, invoice_total: i.total_paise / 100,
  }));
  return new NextResponse(toCSV(rows), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="gst-sales-${month}.csv"` } });
}
