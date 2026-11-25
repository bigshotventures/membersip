import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice, StatusBadge } from '@/components/ui';
import { FileUpload, SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { runImport } from '@/actions/studio/commerce';
import { fmtDate } from '@/lib/utils';

export default async function Imports({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: list }, { data: tiers }] = await Promise.all([
    db.from('imports').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false }),
    db.from('tiers').select('id, name').eq('creator_id', creator.id),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Imports" subtitle="Move members and posts from Patreon, Graphy, Teachable, a Telegram list or any spreadsheet" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {perms.manage ? (
        <Card title="New import">
          <form action={runImport} className="grid gap-4 sm:grid-cols-2"><Slug slug={creator.slug} />
            <Field label="From"><select name="source" className="input"><option value="patreon">Patreon (members CSV)</option><option value="graphy">Graphy</option><option value="teachable">Teachable</option><option value="telegram">Telegram list</option><option value="csv">Other CSV</option></select></Field>
            <Field label="What"><select name="kind" className="input"><option value="members">Members (team only)</option><option value="posts">Posts</option></select></Field>
            <Field label="Give imported members this tier"><select name="tier_id" className="input">{(tiers || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Free months before they need to subscribe"><input name="months" type="number" className="input" defaultValue={1} /></Field>
            <Field label="CSV file" className="sm:col-span-2"><FileUpload name="file_path" scope="studio" creatorId={creator.id} bucket="private" accept=".csv,text/csv" /></Field>
            <Field label="…or paste CSV" className="sm:col-span-2"><textarea name="csv" className="input font-mono text-xs" rows={5} placeholder={'email,name,phone\npriya@example.com,Priya,9876543210'} /></Field>
            <p className="hint sm:col-span-2">Members: needs an <code>email</code> column (name, phone optional). Posts: needs <code>title</code> and <code>body</code> (date optional). Imported members get a welcome email and sign in with their email code.</p>
            <div><SubmitButton pendingText="Importing…">Run import</SubmitButton></div>
          </form>
        </Card>
      ) : <ReadOnlyNotice />}
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Date</th><th>Source</th><th>Type</th><th>Result</th><th>Status</th></tr></thead>
        <tbody>{(list || []).map((i: any) => <tr key={i.id}><td>{fmtDate(i.created_at, true)}</td><td>{i.source}</td><td>{i.kind}</td><td className="text-sm">{i.stats?.imported ?? 0}/{i.stats?.total ?? 0}{i.stats?.errors?.length ? <details><summary className="text-red-600">{i.stats.errors.length} errors</summary><pre className="whitespace-pre-wrap text-xs">{i.stats.errors.join('\n')}</pre></details> : null}</td><td><StatusBadge status={i.status} /></td></tr>)}</tbody></table></div>
    </div>
  );
}
