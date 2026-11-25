import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { saveTier } from '@/actions/studio/content';
import { inr } from '@/lib/utils';

export default async function Tiers({ params, searchParams }: { params: { creator: string }; searchParams: { edit?: string; notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const { data: tiers } = await admin().from('tiers').select('*').eq('creator_id', creator.id).order('position');
  const t: any = searchParams.edit === 'new' ? {} : (tiers || []).find((x: any) => x.id === searchParams.edit);
  const rs = (p: number | null) => (p ? p / 100 : '');
  return (
    <div className="space-y-6">
      <PageHeader title="Tiers & pricing" subtitle="Prices include GST" actions={perms.manage && <Link href="?edit=new" className="btn-primary">New tier</Link>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {!perms.manage && <ReadOnlyNotice />}
      {t && perms.manage && (
        <Card title={t.id ? `Edit ${t.name}` : 'New tier'}>
          <form action={saveTier} className="grid gap-4 sm:grid-cols-2">
            <Slug slug={creator.slug} />{t.id && <input type="hidden" name="id" value={t.id} />}
            <Field label="Name"><input name="name" className="input" defaultValue={t.name} required /></Field>
            <Field label="Order"><input name="position" type="number" className="input" defaultValue={t.position ?? (tiers?.length || 0)} /></Field>
            <Field label="Short description" className="sm:col-span-2"><input name="description" className="input" defaultValue={t.description || ''} /></Field>
            <Field label="Perks (one per line)" className="sm:col-span-2"><textarea name="perks" className="input" rows={5} defaultValue={(t.perks || []).join('\n')} /></Field>
            <Field label="Monthly (₹)"><input name="price_monthly" className="input" defaultValue={rs(t.price_monthly)} /></Field>
            <Field label="Quarterly (₹)"><input name="price_quarterly" className="input" defaultValue={rs(t.price_quarterly)} /></Field>
            <Field label="Yearly (₹)"><input name="price_yearly" className="input" defaultValue={rs(t.price_yearly)} /></Field>
            <Field label="Lifetime (₹, one-time)"><input name="price_lifetime" className="input" defaultValue={rs(t.price_lifetime)} /></Field>
            <Field label="Free trial (days)"><input name="trial_days" type="number" className="input" defaultValue={t.trial_days || 0} /></Field>
            <Field label="Merch discount for this tier (%)"><input name="merch_discount_pct" type="number" className="input" defaultValue={t.merch_discount_pct || 0} /></Field>
            <Field label="WhatsApp group invite link" className="sm:col-span-2"><input name="whatsapp_group_link" className="input" defaultValue={t.whatsapp_group_link || ''} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_featured" defaultChecked={t.is_featured} /> Highlight as most popular</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="archived" defaultChecked={t.id && !t.is_active} /> Archived (hidden from new sign-ups)</label>
            <div className="sm:col-span-2"><SubmitButton>Save tier</SubmitButton></div>
          </form>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {(tiers || []).map((x: any) => (
          <div key={x.id} className={`card p-5 ${x.is_active ? '' : 'opacity-50'}`}>
            <div className="flex justify-between"><h3 className="font-semibold">{x.name}</h3>{perms.manage && <Link href={`?edit=${x.id}`} className="text-sm underline">Edit</Link>}</div>
            <div className="mt-2 space-y-0.5 text-sm">
              {x.price_monthly && <div>{inr(x.price_monthly)}/month</div>}{x.price_quarterly && <div>{inr(x.price_quarterly)}/quarter</div>}
              {x.price_yearly && <div>{inr(x.price_yearly)}/year</div>}{x.price_lifetime && <div>{inr(x.price_lifetime)} lifetime</div>}
              {x.trial_days > 0 && <div className="text-emerald-700">{x.trial_days}-day free trial</div>}
            </div>
            <ul className="mt-3 list-disc pl-5 text-sm text-zinc-600">{x.perks.map((p: string) => <li key={p}>{p}</li>)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}
