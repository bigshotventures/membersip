import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { saveAbTest, stopAbTest } from '@/actions/studio/content';
import { fmtDate } from '@/lib/utils';

export default async function AbTests({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: tests }, { data: tiers }] = await Promise.all([
    db.from('ab_tests').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false }),
    db.from('tiers').select('id, name').eq('creator_id', creator.id).eq('is_active', true).order('position'),
  ]);
  const stats: Record<string, Record<string, Record<string, number>>> = {};
  for (const t of tests || []) {
    const { data: ev } = await db.from('ab_events').select('variant, event').eq('test_id', t.id);
    stats[t.id] = {};
    for (const e of ev || []) { stats[t.id][e.variant] ??= { view: 0, checkout: 0, conversion: 0 }; stats[t.id][e.variant][e.event]++; }
  }
  const running = (tests || []).some((t: any) => t.status === 'running');
  return (
    <div className="space-y-6">
      <PageHeader title="A/B tests" subtitle="Test headlines and tier names on your pricing section. Visitors are split 50/50." />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {(tests || []).map((t: any) => (
        <Card key={t.id} title={t.name} actions={<StatusBadge status={t.status} />}>
          <table className="table"><thead><tr><th>Variant</th><th>Headline</th><th>Views</th><th>Checkouts</th><th>Conversions</th><th>Rate</th></tr></thead>
            <tbody>{t.variants.map((v: any) => { const s = stats[t.id][v.key] || { view: 0, checkout: 0, conversion: 0 }; return (
              <tr key={v.key}><td className="font-bold">{v.key}{t.winner === v.key && ' 🏆'}</td><td className="text-sm">{v.headline || '—'}<div className="text-xs text-zinc-500">{Object.values(v.tier_names || {}).join(', ')}</div></td>
                <td>{s.view}</td><td>{s.checkout}</td><td>{s.conversion}</td><td className="font-medium">{s.view ? ((s.conversion / s.view) * 100).toFixed(2) : '0.00'}%</td></tr>); })}</tbody></table>
          <p className="mt-2 text-xs text-zinc-500">Started {fmtDate(t.created_at)}</p>
          {perms.manage && t.status === 'running' && (
            <form action={stopAbTest} className="mt-3 flex gap-2"><Slug slug={creator.slug} /><input type="hidden" name="id" value={t.id} />
              <select name="winner" className="input w-auto"><option value="">No winner</option>{t.variants.map((v: any) => <option key={v.key} value={v.key}>Winner: {v.key}</option>)}</select>
              <SubmitButton className="btn-outline">Stop test</SubmitButton></form>
          )}
        </Card>
      ))}
      {perms.manage && !running ? (
        <Card title="New pricing test">
          <form action={saveAbTest} className="space-y-4"><Slug slug={creator.slug} />
            <Field label="Test name"><input name="name" className="input" defaultValue="Pricing headline test" /></Field>
            <div className="grid gap-4 md:grid-cols-2">
              {['A', 'B'].map((k) => (
                <div key={k} className="space-y-2 rounded-lg border p-3">
                  <div className="font-bold">Variant {k}</div>
                  <input name={`headline_${k}`} className="input" placeholder="Headline above tiers" />
                  {(tiers || []).map((t: any) => <input key={t.id} name={`name_${k}_${t.id}`} className="input" placeholder={`Name for "${t.name}" (optional)`} />)}
                </div>
              ))}
            </div>
            <SubmitButton>Start test</SubmitButton>
          </form>
        </Card>
      ) : !perms.manage ? <ReadOnlyNotice /> : null}
    </div>
  );
}
