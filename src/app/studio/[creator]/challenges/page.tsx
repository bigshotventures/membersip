import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { MarkdownArea, Slug, TierPicker } from '@/components/studio/bits';
import { deleteChallenge, saveChallenge } from '@/actions/studio/community';
import { fmtDate, isoToIstLocal } from '@/lib/utils';

export default async function ChallengesStudio({ params, searchParams }: { params: { creator: string }; searchParams: { edit?: string; notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: list }, { data: tiers }, { data: badges }] = await Promise.all([
    db.from('challenges').select('*, challenge_participants(count), challenge_checkins(count)').eq('creator_id', creator.id).order('starts_at', { ascending: false }),
    db.from('tiers').select('id, name').eq('creator_id', creator.id).order('position'),
    db.from('badges').select('id, name, icon').eq('creator_id', creator.id),
  ]);
  const c: any = searchParams.edit === 'new' ? { days: 30, points_per_checkin: 10 } : (list || []).find((x: any) => x.id === searchParams.edit);
  const slug = creator.slug;
  return (
    <div className="space-y-6">
      <PageHeader title="Challenges" subtitle="30-day challenges with daily check-ins, points and badges" actions={perms.manage && <Link href="?edit=new" className="btn-primary">New challenge</Link>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {!perms.manage && <ReadOnlyNotice />}
      {c && perms.manage && (
        <Card title={c.id ? 'Edit challenge' : 'New challenge'}>
          <form action={saveChallenge} className="grid gap-4 sm:grid-cols-3"><Slug slug={slug} />{c.id && <input type="hidden" name="id" value={c.id} />}
            <Field label="Title" className="sm:col-span-3"><input name="title" className="input" defaultValue={c.title} required /></Field>
            <Field label="Starts (IST)"><input name="starts_at" type="datetime-local" className="input" defaultValue={isoToIstLocal(c.starts_at)} required /></Field>
            <Field label="Days"><input name="days" type="number" className="input" defaultValue={c.days} /></Field>
            <Field label="Points per check-in"><input name="points_per_checkin" type="number" className="input" defaultValue={c.points_per_checkin} /></Field>
            <Field label="Completion badge"><select name="completion_badge_id" className="input" defaultValue={c.completion_badge_id || ''}><option value="">None</option>{(badges || []).map((b: any) => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}</select></Field>
            <div className="sm:col-span-2"><TierPicker tiers={tiers || []} selected={c.tier_ids || []} /></div>
            <Field label="Description" className="sm:col-span-3"><MarkdownArea name="description" defaultValue={c.description} rows={5} /></Field>
            <Field label="Daily prompts (one per line, optional)" className="sm:col-span-3"><textarea name="daily_prompts" className="input" rows={5} defaultValue={(c.daily_prompts || []).join('\n')} /></Field>
            <div className="flex gap-2 sm:col-span-3"><SubmitButton>Save</SubmitButton>{c.id && <button formAction={deleteChallenge} name="id" value={c.id} className="btn-ghost text-red-600">Delete</button>}</div>
          </form>
        </Card>
      )}
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Challenge</th><th>Starts</th><th>Days</th><th>Joined</th><th>Check-ins</th><th /></tr></thead>
        <tbody>{(list || []).map((x: any) => <tr key={x.id}><td className="font-medium">{x.title}</td><td>{fmtDate(x.starts_at)}</td><td>{x.days}</td><td>{x.challenge_participants?.[0]?.count || 0}</td><td>{x.challenge_checkins?.[0]?.count || 0}</td>
          <td className="text-right"><Link href={`/${slug}/challenges/${x.id}`} target="_blank" className="btn-ghost btn-sm">View</Link>{perms.manage && <Link href={`?edit=${x.id}`} className="btn-ghost btn-sm">Edit</Link>}</td></tr>)}</tbody></table></div>
    </div>
  );
}
