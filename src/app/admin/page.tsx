import Link from 'next/link';
import { admin } from '@/lib/supabase/admin';
import { Card, PageHeader, Stat } from '@/components/ui';
import { BarChart } from '@/components/charts';
import { fmtDate, inr, timeAgo } from '@/lib/utils';

export default async function AdminHome() {
  const db = admin();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: pays }, { count: creators }, { count: members }, { count: openReq }, { count: openSvc }, { data: recent }] = await Promise.all([
    db.from('payments').select('amount_paise, platform_fee_paise, gst_paise, tds_paise, refunded_paise, created_at').gte('created_at', since),
    db.from('creators').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    db.from('memberships').select('id', { count: 'exact', head: true }).in('status', ['active', 'trialing', 'past_due']),
    db.from('data_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db.from('service_orders').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    db.from('payments').select('amount_paise, kind, created_at, creator:creators(name)').order('created_at', { ascending: false }).limit(10),
  ]);
  const sum = (k: string) => (pays || []).reduce((a: number, p: any) => a + p[k], 0);
  const byDay = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000 + 330 * 60000).toISOString().slice(0, 10);
    return { label: d.slice(5), value: (pays || []).filter((p: any) => new Date(+new Date(p.created_at) + 330 * 60000).toISOString().slice(0, 10) === d).reduce((a: number, p: any) => a + p.amount_paise, 0) };
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" subtitle="Last 30 days" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="GMV" value={inr(sum('amount_paise'))} sub={`${inr(sum('refunded_paise'))} refunded`} />
        <Stat label="Platform commission" value={inr(sum('platform_fee_paise'))} />
        <Stat label="GST collected" value={inr(sum('gst_paise'))} sub={`TDS deducted ${inr(sum('tds_paise'))}`} />
        <Stat label="Live creators / members" value={`${creators || 0} / ${members || 0}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="GMV by day" className="lg:col-span-2"><BarChart money data={byDay} /></Card>
        <Card title="Needs attention">
          <Link href="/admin/compliance" className="block py-1 text-sm underline">{openReq || 0} open data requests</Link>
          <Link href="/admin/services" className="block py-1 text-sm underline">{openSvc || 0} new service requests</Link>
          <Link href="/admin/payouts" className="block py-1 text-sm underline">Run payouts</Link>
        </Card>
      </div>
      <Card title="Latest payments">
        {(recent || []).map((p: any, i: number) => <div key={i} className="flex justify-between border-b py-1 text-sm last:border-0"><span>{p.creator?.name} · {p.kind}</span><span>{inr(p.amount_paise)} · <span className="text-zinc-500">{timeAgo(p.created_at)}</span></span></div>)}
      </Card>
    </div>
  );
}
