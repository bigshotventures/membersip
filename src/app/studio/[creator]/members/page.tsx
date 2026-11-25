import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, StatusBadge, Avatar } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { addMember, awardBadge, endMembership, restrictMember } from '@/actions/studio/commerce';
import { fmtDate } from '@/lib/utils';

export default async function Members({ params, searchParams }: { params: { creator: string }; searchParams: { q?: string; status?: string; tier?: string; notice?: string; open?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  let q = db.from('memberships').select('*, user:profiles!memberships_user_id_fkey(id, full_name, email, phone, avatar_url), tier:tiers!memberships_tier_id_fkey(name)').eq('creator_id', creator.id).order('started_at', { ascending: false }).limit(500);
  if (searchParams.status) q = q.eq('status', searchParams.status);
  if (searchParams.tier) q = q.eq('tier_id', searchParams.tier);
  const [{ data: rows }, { data: tiers }, { data: badges }, { data: stats }] = await Promise.all([
    q, db.from('tiers').select('id, name').eq('creator_id', creator.id).order('position'),
    db.from('badges').select('id, name, icon').eq('creator_id', creator.id),
    db.from('member_stats').select('user_id, points, current_streak').eq('creator_id', creator.id),
  ]);
  const term = (searchParams.q || '').toLowerCase();
  const members = (rows || []).filter((m: any) => !term || [m.user?.full_name, m.user?.email, m.user?.phone].some((v) => v?.toLowerCase().includes(term)));
  const pts = new Map((stats || []).map((s: any) => [s.user_id, s]));
  const slug = creator.slug;
  const open = members.find((m: any) => m.id === searchParams.open);

  return (
    <div className="space-y-6">
      <PageHeader title="Members" subtitle={`${members.length} shown`} actions={<a className="btn-outline btn-sm" href={`/api/studio/export?slug=${slug}&what=members`}>Export CSV</a>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={searchParams.q} className="input w-64" placeholder="Search name, email, phone" />
        <select name="status" defaultValue={searchParams.status || ''} className="input w-auto"><option value="">All statuses</option>{['active', 'trialing', 'past_due', 'paused', 'cancelled', 'expired'].map((s) => <option key={s}>{s}</option>)}</select>
        <select name="tier" defaultValue={searchParams.tier || ''} className="input w-auto"><option value="">All tiers</option>{(tiers || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <button className="btn-dark">Filter</button>
      </form>
      {open && (
        <Card title={open.user?.full_name} actions={<Link href="?" className="text-sm underline">Close</Link>}>
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div>{open.user?.email}<br />{open.user?.phone}<br />Joined {fmtDate(open.started_at)} · {open.source}<br />{open.tier?.name} · {open.billing_period} · <StatusBadge status={open.status} /></div>
            <div className="space-y-2">
              {perms.manage && <form action={awardBadge} className="flex gap-1"><Slug slug={slug} /><input type="hidden" name="user_id" value={open.user_id} /><select name="badge_id" className="input py-1">{(badges || []).map((b: any) => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}</select><SubmitButton className="btn-outline btn-sm">Award</SubmitButton></form>}
              {perms.moderate && <form action={restrictMember} className="flex gap-1"><Slug slug={slug} /><input type="hidden" name="user_id" value={open.user_id} />
                <select name="kind" className="input py-1"><option value="muted">Mute</option><option value="banned">Ban</option><option value="clear">Lift restriction</option></select><input name="days" type="number" className="input w-20 py-1" placeholder="days" /><SubmitButton className="btn-outline btn-sm">Apply</SubmitButton></form>}
              <Link href={`/studio/${slug}/messages?member=${open.user_id}`} className="btn-outline btn-sm">Message</Link>
            </div>
            {perms.staff && <form action={endMembership} className="space-y-2"><Slug slug={slug} /><input type="hidden" name="id" value={open.id} />
              <label className="flex items-center gap-2"><input type="checkbox" name="immediately" /> End access immediately</label>
              <SubmitButton className="btn-danger btn-sm" confirm="End this membership?">End membership</SubmitButton></form>}
          </div>
        </Card>
      )}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Member</th><th>Tier</th><th>Status</th><th>Since</th><th>Renews / ends</th><th>Points</th></tr></thead>
          <tbody>
            {members.map((m: any) => (
              <tr key={m.id}>
                <td><Link href={`?open=${m.id}`} className="flex items-center gap-2 hover:underline"><Avatar src={m.user?.avatar_url} name={m.user?.full_name} size={28} /><div><div className="font-medium">{m.user?.full_name}</div><div className="text-xs text-zinc-500">{m.user?.email}</div></div></Link></td>
                <td>{m.tier?.name}<div className="text-xs text-zinc-500">{m.billing_period}</div></td>
                <td><StatusBadge status={m.status} />{m.cancel_at_period_end && <div className="text-xs text-amber-700">cancelling</div>}</td>
                <td className="text-sm">{fmtDate(m.started_at)}</td>
                <td className="text-sm">{m.billing_period === 'lifetime' ? 'Lifetime' : fmtDate(m.current_period_end)}</td>
                <td className="text-sm">{(pts.get(m.user_id) as any)?.points || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {perms.staff && (
        <Card title="Add a member (free / comp)">
          <form action={addMember} className="grid gap-3 sm:grid-cols-4"><Slug slug={slug} />
            <input name="email" type="email" className="input" placeholder="Email" required />
            <input name="name" className="input" placeholder="Name" />
            <select name="tier_id" className="input">{(tiers || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <Field label=""><input name="months" type="number" className="input" placeholder="Months (empty = lifetime)" /></Field>
            <div className="sm:col-span-4"><SubmitButton>Add member</SubmitButton></div>
          </form>
        </Card>
      )}
    </div>
  );
}
