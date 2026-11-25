import { admin } from '@/lib/supabase/admin';
import { Notice, PageHeader, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { refund } from '@/actions/admin';
import { fmtDate, inr } from '@/lib/utils';

export default async function Payments({ searchParams }: { searchParams: { q?: string; notice?: string } }) {
  let q = admin().from('payments').select('*, creator:creators(name), user:profiles(full_name, email)').order('created_at', { ascending: false }).limit(300);
  if (searchParams.q) q = q.eq('razorpay_payment_id', searchParams.q.trim());
  const { data } = await q;
  return (
    <div className="space-y-4">
      <PageHeader title="Payments & refunds" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <form className="flex gap-2"><input name="q" className="input w-72" placeholder="Razorpay payment id (pay_…)" defaultValue={searchParams.q} /><button className="btn-dark">Find</button></form>
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Date</th><th>Buyer</th><th>Creator</th><th>Kind</th><th>Amount</th><th>Fee</th><th>Status</th><th>Refund</th></tr></thead>
        <tbody>{(data || []).map((p: any) => (
          <tr key={p.id}><td className="text-sm">{fmtDate(p.created_at, true)}<div className="font-mono text-[10px] text-zinc-400">{p.razorpay_payment_id}</div></td><td className="text-sm">{p.user?.full_name}<div className="text-xs text-zinc-500">{p.user?.email}</div></td><td className="text-sm">{p.creator?.name}</td><td>{p.kind}</td>
            <td>{inr(p.amount_paise)}{p.refunded_paise > 0 && <div className="text-xs text-red-600">−{inr(p.refunded_paise)}</div>}</td><td>{inr(p.platform_fee_paise)}</td><td><StatusBadge status={p.status} /></td>
            <td>{p.refunded_paise < p.amount_paise && (
              <form action={refund} className="flex min-w-72 flex-wrap gap-1"><input type="hidden" name="id" value={p.id} />
                <input name="amount" className="input w-20 py-1 text-xs" placeholder="₹ full" /><input name="reason" className="input w-28 py-1 text-xs" placeholder="Reason" />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="revoke" /> revoke access</label>
                <SubmitButton className="btn-outline btn-sm" confirm="Issue this refund via Razorpay?">Refund</SubmitButton></form>)}</td></tr>
        ))}</tbody></table></div>
    </div>
  );
}
