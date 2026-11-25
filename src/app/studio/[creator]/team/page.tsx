import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, Avatar } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { addTeamMember, removeTeamMember, saveSplit, toggleCreatorEditing } from '@/actions/studio/commerce';

const ROLES: Record<string, string> = { owner: 'Owner — sees everything incl. earnings', editor: 'Editor — content (when editing is enabled)', moderator: 'Moderator — community, messages, grading', accountant: 'Accountant — earnings & payouts only' };

export default async function Team({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: team }, { data: splits }, { data: courses }] = await Promise.all([
    db.from('creator_team').select('role, user:profiles(id, full_name, email, avatar_url)').eq('creator_id', creator.id),
    db.from('revenue_splits').select('*, partner:creators!revenue_splits_partner_creator_id_fkey(name, slug)').eq('creator_id', creator.id),
    db.from('courses').select('id, title').eq('creator_id', creator.id),
  ]);
  const slug = creator.slug;
  return (
    <div className="space-y-6">
      <PageHeader title="Team" subtitle="Who can access this dashboard" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <Card>
        {(team || []).map((t: any) => (
          <div key={t.user.id} className="flex items-center gap-3 border-b py-2 last:border-0">
            <Avatar src={t.user.avatar_url} name={t.user.full_name} size={32} />
            <div className="flex-1 text-sm"><b>{t.user.full_name}</b> <span className="text-zinc-500">{t.user.email}</span><div className="text-xs text-zinc-500">{ROLES[t.role]}</div></div>
            {perms.staff && <form action={removeTeamMember}><Slug slug={slug} /><input type="hidden" name="user_id" value={t.user.id} /><SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Remove access?">Remove</SubmitButton></form>}
          </div>
        ))}
        {!team?.length && <p className="text-sm text-zinc-500">No creator accounts yet.</p>}
      </Card>
      {perms.staff && (
        <>
          <Card title="Add someone">
            <form action={addTeamMember} className="grid gap-3 sm:grid-cols-4"><Slug slug={slug} />
              <input name="email" type="email" className="input" placeholder="Email" required /><input name="name" className="input" placeholder="Name" />
              <select name="role" className="input sm:col-span-2">{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <div className="sm:col-span-4"><SubmitButton>Add</SubmitButton></div>
            </form>
          </Card>
          <Card title="Creator editing">
            <form action={toggleCreatorEditing} className="flex items-center gap-3"><Slug slug={slug} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={creator.creator_edit_enabled} /> Let the creator's owner/editor accounts edit content themselves (otherwise view-only, managed by your team)</label>
              <SubmitButton className="btn-outline btn-sm">Save</SubmitButton>
            </form>
          </Card>
          <Card title="Collaboration revenue splits">
            <p className="mb-3 text-sm text-zinc-600">When two creators run a course together, a share of this creator's net earnings from that course goes to the partner automatically.</p>
            {(splits || []).map((s: any) => <div key={s.id} className="py-1 text-sm">{courses?.find((c: any) => c.id === s.item_id)?.title || s.item_id} → <b>{s.partner?.name}</b> gets {s.pct}%</div>)}
            <form action={saveSplit} className="mt-3 grid gap-2 sm:grid-cols-4"><Slug slug={slug} /><input type="hidden" name="item_kind" value="course" />
              <select name="item_id" className="input">{(courses || []).map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
              <input name="partner_slug" className="input" placeholder="Partner creator's URL name" required />
              <input name="pct" type="number" step="0.5" className="input" placeholder="% to partner" required />
              <SubmitButton className="btn-outline">Save split</SubmitButton>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
