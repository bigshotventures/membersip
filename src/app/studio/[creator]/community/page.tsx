import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug, TierPicker } from '@/components/studio/bits';
import { deleteSpace, saveSpace } from '@/actions/studio/community';

export default async function SpacesStudio({ params, searchParams }: { params: { creator: string }; searchParams: { edit?: string; notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: spaces }, { data: tiers }] = await Promise.all([
    db.from('spaces').select('*, space_posts(count), chat_messages(count)').eq('creator_id', creator.id).order('position'),
    db.from('tiers').select('id, name').eq('creator_id', creator.id).order('position'),
  ]);
  const s: any = searchParams.edit === 'new' ? { kind: 'feed', members_can_post: true } : (spaces || []).find((x: any) => x.id === searchParams.edit);
  const slug = creator.slug;
  return (
    <div className="space-y-6">
      <PageHeader title="Community spaces" subtitle="Feeds for discussions and real-time chat rooms" actions={perms.manage && <Link href="?edit=new" className="btn-primary">New space</Link>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {!perms.manage && <ReadOnlyNotice />}
      {s && perms.manage && (
        <Card title={s.id ? 'Edit space' : 'New space'}>
          <form action={saveSpace} className="grid gap-4 sm:grid-cols-2"><Slug slug={slug} />{s.id && <input type="hidden" name="id" value={s.id} />}
            <Field label="Name"><input name="name" className="input" defaultValue={s.name} required placeholder="Wins, Q&A, General…" /></Field>
            <Field label="Type"><select name="kind" className="input" defaultValue={s.kind}><option value="feed">Discussion feed</option><option value="chat">Live chat room</option></select></Field>
            <Field label="Description" className="sm:col-span-2"><input name="description" className="input" defaultValue={s.description || ''} /></Field>
            <div className="sm:col-span-2"><TierPicker tiers={tiers || []} selected={s.tier_ids || []} /></div>
            <Field label="Order"><input name="position" type="number" className="input" defaultValue={s.position || 0} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="members_can_post" defaultChecked={s.members_can_post} /> Members can post (off = announcements only)</label>
            <div className="flex gap-2 sm:col-span-2"><SubmitButton>Save</SubmitButton>{s.id && <button formAction={deleteSpace} name="id" value={s.id} className="btn-ghost text-red-600">Delete space</button>}</div>
          </form>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {(spaces || []).map((x: any) => (
          <div key={x.id} className="card p-5">
            <div className="flex justify-between"><h3 className="font-semibold">{x.kind === 'chat' ? '💬' : '#'} {x.name}</h3><div className="space-x-2 text-sm"><Link href={`/${slug}/community/${x.id}`} target="_blank" className="underline">Open</Link>{perms.manage && !x.cohort_id && <Link href={`?edit=${x.id}`} className="underline">Edit</Link>}</div></div>
            <p className="text-sm text-zinc-500">{x.cohort_id ? 'Cohort space' : x.tier_ids.length ? `${x.tier_ids.length} tier(s)` : 'All members'} · {x.kind === 'chat' ? `${x.chat_messages?.[0]?.count || 0} messages` : `${x.space_posts?.[0]?.count || 0} posts`}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
