import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { AccountShell } from '@/components/account/AccountShell';
import { Card, Empty, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { changeTier, resumeMembership } from '@/actions/billing';
import { fmtDate, inr } from '@/lib/utils';

export const metadata = { title: 'Billing' };

export default async function Billing({ searchParams }: { searchParams: { notice?: string; error?: string } }) {
  const p = await requireProfile('/account/billing');
  const db = admin();
  const [{ data: ms }, { data: invoices }] = await Promise.all([
    db.from('memberships').select('*, creator:creators(id, slug, name), tier:tiers!memberships_tier_id_fkey(id, name), pending:tiers!memberships_pending_tier_id_fkey(name)').eq('user_id', p.id).order('created_at', { ascending: false }),
    db.from('invoices').select('id, invoice_number, total_paise, line_description, created_at, creator:creators(name)').eq('user_id', p.id).order('created_at', { ascending: false }).limit(100),
  ]);
  const tiersBy = new Map<string, any[]>();
  for (const m of ms || []) {
    const { data } = await db.from('tiers').select('id, name, price_monthly, price_quarterly, price_yearly').eq('creator_id', m.creator_id).eq('is_active', true).order('position');
    tiersBy.set(m.creator_id, data || []);
  }

  return (
    <AccountShell active="/account/billing">
      <PageHeader title="Billing & invoices" subtitle={p.credit_paise ? `Account credit: ${inr(p.credit_paise)}` : undefined} />
      {searchParams.notice && <div className="mb-4"><Notice tone="success">{searchParams.notice}</Notice></div>}
      {searchParams.error && <div className="mb-4"><Notice tone="error">{searchParams.error}</Notice></div>}

      <div className="space-y-4">
        {!ms?.length && <Empty title="No memberships yet" />}
        {(ms || []).map((m: any) => {
          const recurring = !!m.razorpay_subscription_id;
          const live = ['active', 'trialing', 'past_due'].includes(m.status) && !m.cancel_at_period_end;
          return (
            <Card key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/${m.creator.slug}`} className="font-semibold hover:underline">{m.creator.name}</Link>
                  <div className="text-sm text-zinc-500">{m.tier?.name} · {m.billing_period} · <StatusBadge status={m.status} /> {m.source !== 'purchase' && <span className="badge">{m.source}</span>}</div>
                  <div className="mt-1 text-sm">
                    {m.status === 'paused' ? `Paused until ${fmtDate(m.paused_until)}` :
                      m.cancel_at_period_end || m.status === 'cancelled' ? `Cancelled — access until ${fmtDate(m.current_period_end)}` :
                      m.billing_period === 'lifetime' ? 'Lifetime access' :
                      recurring ? `Next renewal ${fmtDate(m.current_period_end)}` : `Access until ${fmtDate(m.current_period_end)}`}
                  </div>
                  {m.pending && <div className="text-xs text-amber-700">Switching to {m.pending.name} at next renewal</div>}
                  {m.next_charge_discount_pct > 0 && <div className="text-xs text-emerald-700">{m.next_charge_discount_pct}% off your next renewal (refunded automatically)</div>}
                  {m.status === 'past_due' && <p className="mt-2 text-sm text-red-700">Your last payment failed. Make sure your UPI Autopay mandate or card is active — we'll retry automatically.</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.status === 'paused' && <form action={resumeMembership}><input type="hidden" name="membership_id" value={m.id} /><SubmitButton className="btn-primary btn-sm">Resume now</SubmitButton></form>}
                  {live && recurring && <Link href={`/account/memberships/${m.id}/cancel`} className="btn-outline btn-sm">Cancel membership</Link>}
                  {(!live || !recurring) && m.billing_period !== 'lifetime' && <Link href={`/${m.creator.slug}#join`} className="btn-primary btn-sm">{live ? 'Subscribe' : 'Rejoin'}</Link>}
                </div>
              </div>
              {live && recurring && (tiersBy.get(m.creator_id) || []).length > 1 && (
                <form action={changeTier} className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
                  <input type="hidden" name="membership_id" value={m.id} />
                  <span>Change plan:</span>
                  <select name="tier_id" className="input w-auto">
                    {(tiersBy.get(m.creator_id) || []).filter((t: any) => t.id !== m.tier_id && t[`price_${m.billing_period}`]).map((t: any) => <option key={t.id} value={t.id}>{t.name} — {inr(t[`price_${m.billing_period}`])}/{m.billing_period}</option>)}
                  </select>
                  <SubmitButton className="btn-outline btn-sm">Switch at next renewal</SubmitButton>
                </form>
              )}
            </Card>
          );
        })}
      </div>

      <h2 className="mb-3 mt-10 font-semibold">Invoices</h2>
      {!invoices?.length ? <Empty title="No invoices yet" /> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Invoice</th><th>For</th><th>Amount</th><th /></tr></thead>
            <tbody>
              {invoices.map((i: any) => (
                <tr key={i.id}><td>{fmtDate(i.created_at)}</td><td className="font-mono text-xs">{i.invoice_number}</td><td>{i.line_description}<div className="text-xs text-zinc-500">{i.creator?.name}</div></td><td>{inr(i.total_paise, { decimals: true })}</td>
                  <td><a href={`/api/invoices/${i.id}`} target="_blank" className="text-sm underline">PDF</a></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountShell>
  );
}
