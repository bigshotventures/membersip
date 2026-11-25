import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { saveCoupon, toggleCoupon } from '@/actions/studio/content';
import { fmtDate, inr } from '@/lib/utils';

export default async function Coupons({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const { data } = await admin().from('coupons').select('*').eq('creator_id', creator.id).eq('internal', false).order('created_at', { ascending: false });
  return (
    <div className="space-y-6">
      <PageHeader title="Coupons" subtitle="Launch offers, festival sales, partner codes" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {perms.manage ? (
        <Card title="New coupon">
          <form action={saveCoupon} className="grid gap-4 sm:grid-cols-3">
            <Slug slug={creator.slug} />
            <Field label="Code"><input name="code" className="input uppercase" required placeholder="DIWALI30" /></Field>
            <Field label="Type"><select name="kind" className="input"><option value="percent">% off</option><option value="flat">₹ off</option></select></Field>
            <Field label="Value"><input name="value" className="input" required placeholder="30" /></Field>
            <Field label="Applies to"><select name="applies_to" className="input">{['any', 'membership', 'course', 'product', 'booking', 'event'].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Max uses"><input name="max_redemptions" type="number" className="input" placeholder="Unlimited" /></Field>
            <Field label="Expires (IST)"><input name="expires_at" type="datetime-local" className="input" /></Field>
            <div className="sm:col-span-3"><SubmitButton>Create coupon</SubmitButton><p className="hint mt-2">On memberships, coupons discount the first billing period.</p></div>
          </form>
        </Card>
      ) : <ReadOnlyNotice />}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Code</th><th>Discount</th><th>Scope</th><th>Used</th><th>Expires</th><th /></tr></thead>
          <tbody>
            {(data || []).map((c: any) => (
              <tr key={c.id} className={c.active ? '' : 'opacity-50'}>
                <td className="font-mono font-semibold">{c.code}</td><td>{c.kind === 'percent' ? `${c.value}%` : inr(c.value)}</td><td>{c.applies_to}</td>
                <td>{c.redeemed_count}{c.max_redemptions ? ` / ${c.max_redemptions}` : ''}</td><td>{c.expires_at ? fmtDate(c.expires_at) : '—'}</td>
                <td>{perms.manage && <form action={toggleCoupon}><Slug slug={creator.slug} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={c.active ? '' : 'on'} /><SubmitButton className="btn-ghost btn-sm">{c.active ? 'Disable' : 'Enable'}</SubmitButton></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
