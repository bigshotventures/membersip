import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { createPayout, markPayoutPaid } from '@/actions/admin';
import { fmtDate, inr } from '@/lib/utils';

export default async function Payouts({ searchParams }: { searchParams: { notice?: string } }) {
  const db = admin();
  const [{ data: creators }, { data: unpaid }, { data: payouts }] = await Promise.all([
    db.from('creators').select('id, name, bank_account_name, bank_account_last4, bank_ifsc, kyc_status').order('name'),
    db.from('payments').select('creator_id, creator_net_paise').is('payout_id', null),
    db.from('payouts').select('*, creator:creators(name, bank_account_name, bank_account_last4, bank_ifsc)').order('created_at', { ascending: false }).limit(100),
  ]);
  const owed = (id: string) => (unpaid || []).filter((p: any) => p.creator_id === id).reduce((a: number, p: any) => a + p.creator_net_paise, 0);
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  return (
    <div className="space-y-6">
      <PageHeader title="Payouts" subtitle="Bundle earnings into a payout, transfer via your bank or RazorpayX, then mark it paid with the UTR" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <Card title="Create payout">
        <form action={createPayout} className="flex flex-wrap items-end gap-3">
          <Field label="Creator"><select name="creator_id" className="input">{(creators || []).map((c: any) => <option key={c.id} value={c.id}>{c.name} — owed ~{inr(owed(c.id))}{c.kyc_status !== 'verified' ? ' (KYC pending)' : ''}</option>)}</select></Field>
          <Field label="Include payments up to"><input name="until" type="date" className="input" defaultValue={today} /></Field>
          <SubmitButton>Create payout</SubmitButton>
        </form>
      </Card>
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Creator</th><th>Period</th><th>Gross</th><th>Fee</th><th>TDS</th><th>Net</th><th>Bank</th><th>Status</th></tr></thead>
        <tbody>{(payouts || []).map((p: any) => (
          <tr key={p.id}><td>{p.creator?.name}</td><td className="text-sm">{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</td><td>{inr(p.gross_paise)}</td><td>{inr(p.platform_fee_paise)}</td><td>{inr(p.tds_paise)}</td><td className="font-semibold">{inr(p.net_paise)}</td>
            <td className="text-xs">{p.creator?.bank_account_name}<br />••••{p.creator?.bank_account_last4} · {p.creator?.bank_ifsc}</td>
            <td>{p.status === 'paid' ? <><StatusBadge status="paid" /><div className="font-mono text-[10px]">{p.utr}</div></> : (
              <form action={markPayoutPaid} className="flex gap-1"><input type="hidden" name="id" value={p.id} /><input name="utr" className="input w-32 py-1 text-xs" placeholder="UTR" required /><SubmitButton className="btn-outline btn-sm">Mark paid</SubmitButton></form>)}</td></tr>
        ))}</tbody></table></div>
    </div>
  );
}
