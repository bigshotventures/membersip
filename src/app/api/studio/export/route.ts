import { NextResponse } from 'next/server';
import { getCreator, getProfile, studioPerms } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { toCSV } from '@/lib/csv';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') || '', what = url.searchParams.get('what');
  const p = await getProfile();
  const c = await getCreator(slug);
  if (!p || !c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const perms = await studioPerms(c, p);
  if (!perms.view) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const db = admin();
  let rows: any[] = [];
  if (what === 'members') {
    const { data } = await db.from('memberships').select('status, billing_period, started_at, current_period_end, source, user:profiles!memberships_user_id_fkey(full_name, email, phone), tier:tiers!memberships_tier_id_fkey(name)').eq('creator_id', c.id);
    rows = (data || []).map((m: any) => ({ name: m.user?.full_name, email: m.user?.email, phone: m.user?.phone, tier: m.tier?.name, status: m.status, billing: m.billing_period, source: m.source, joined: m.started_at, period_end: m.current_period_end }));
  } else if (what === 'waitlist') {
    const { data } = await db.from('waitlist').select('email, name, phone, created_at, notified_at').eq('creator_id', c.id);
    rows = data || [];
  } else if (what === 'payments' && perms.finance) {
    const { data } = await db.from('payments').select('created_at, kind, method, amount_paise, taxable_paise, gst_paise, platform_fee_paise, tds_paise, creator_net_paise, refunded_paise, razorpay_payment_id, invoice:invoices(invoice_number)').eq('creator_id', c.id).order('created_at');
    rows = (data || []).map((x: any) => ({ date: x.created_at, invoice: x.invoice?.[0]?.invoice_number ?? x.invoice?.invoice_number, kind: x.kind, method: x.method, amount: x.amount_paise / 100, taxable: x.taxable_paise / 100, gst: x.gst_paise / 100, platform_fee: x.platform_fee_paise / 100, tds: x.tds_paise / 100, your_earnings: x.creator_net_paise / 100, refunded: x.refunded_paise / 100, razorpay_id: x.razorpay_payment_id }));
  } else return NextResponse.json({ error: 'Unknown export' }, { status: 400 });
  return new NextResponse(toCSV(rows), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${slug}-${what}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
