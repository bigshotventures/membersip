import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { fmtDate, inr } from '@/lib/utils';

export default async function Finance({ params }: { params: { creator: string } }) {
  const { creator } = await requireStudio(params.creator, 'finance');
  const db = admin();
  const [{ data: pays }, { data: payouts }] = await Promise.all([
    db.from('payments').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false }).limit(300),
    db.from('payouts').select('*').eq('creator_id', creator.id).order('period_end', { ascending: false }),
  ]);
  const sum = (k: string, rows = pays || []) => rows.reduce((a: number, r: any) => a + (r[k] || 0), 0);
  const unpaid = (pays || []).filter((p: any) => !p.payout_id);
  return (
    <div className="space-y-6">
      <PageHeader title="Earnings & payouts" subtitle="GST is collected and filed by the platform. TDS under Sec 194-O is deducted on your earnings — Form 16A is issued quarterly." actions={<a className="btn-outline btn-sm" href={`/api/studio/export?slug=${creator.slug}&what=payments`}>Export CSV</a>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Lifetime gross" value={inr(sum('amount_paise'))} />
        <Stat label="Your lifetime earnings" value={inr(sum('creator_net_paise'))} />
        <Stat label="Awaiting payout" value={inr(sum('creator_net_paise', unpaid))} sub={`${unpaid.length} payments`} />
        <Stat label="Paid out" value={inr(sum('net_paise', (payouts || []).filter((p: any) => p.status === 'paid')))} />
      </div>
      <Card title="Payouts">
        <table className="table"><thead><tr><th>Period</th><th>Gross</th><th>GST</th><th>Platform fee</th><th>TDS</th><th>Refunds</th><th>Net</th><th>Status</th><th>UTR</th></tr></thead>
          <tbody>{(payouts || []).map((p: any) => <tr key={p.id}><td>{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</td><td>{inr(p.gross_paise)}</td><td>{inr(p.gst_paise)}</td><td>{inr(p.platform_fee_paise)}</td><td>{inr(p.tds_paise)}</td><td>{inr(p.refunds_paise)}</td><td className="font-semibold">{inr(p.net_paise)}</td><td><StatusBadge status={p.status} /></td><td className="font-mono text-xs">{p.utr}</td></tr>)}</tbody></table>
        {!payouts?.length && <p className="text-sm text-zinc-500">No payouts yet</p>}
      </Card>
      <Card title="Payments">
        <div className="overflow-x-auto"><table className="table"><thead><tr><th>Date</th><th>Type</th><th>Paid</th><th>GST</th><th>Fee</th><th>TDS</th><th>You earn</th><th>Status</th></tr></thead>
          <tbody>{(pays || []).map((p: any) => <tr key={p.id}><td>{fmtDate(p.created_at, true)}</td><td>{p.kind}</td><td>{inr(p.amount_paise)}</td><td>{inr(p.gst_paise)}</td><td>{inr(p.platform_fee_paise)}</td><td>{inr(p.tds_paise)}</td><td className="font-medium">{inr(p.creator_net_paise)}</td><td><StatusBadge status={p.status} /></td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}
