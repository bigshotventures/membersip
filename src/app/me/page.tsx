import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { AccountShell } from '@/components/account/AccountShell';
import { Avatar, Empty, PageHeader, StatusBadge } from '@/components/ui';
import { fmtDate } from '@/lib/utils';

export const metadata = { title: 'My memberships' };

export default async function MePage() {
  const p = await requireProfile('/me');
  const db = admin();
  const [{ data: ms }, { data: ents }, { data: team }, { data: lives }] = await Promise.all([
    db.from('memberships').select('*, creator:creators(slug, name, avatar_url, tagline), tier:tiers!memberships_tier_id_fkey(name)').eq('user_id', p.id).order('created_at', { ascending: false }),
    db.from('entitlements').select('kind, item_id, creator:creators(slug, name)').eq('user_id', p.id).in('kind', ['course', 'product', 'cohort']),
    db.from('creator_team').select('role, creator:creators(slug, name, avatar_url, status)').eq('user_id', p.id),
    db.from('live_sessions').select('id, title, starts_at, creator:creators!inner(slug, name)').gte('starts_at', new Date().toISOString()).eq('status', 'scheduled').order('starts_at').limit(30),
  ]);
  const active = (ms || []).filter((m: any) => ['active', 'trialing', 'past_due'].includes(m.status) || (m.status === 'cancelled' && new Date(m.current_period_end) > new Date()));
  const mySlugs = new Set(active.map((m: any) => m.creator.slug));
  const upcoming = (lives || []).filter((l: any) => mySlugs.has(l.creator.slug)).slice(0, 5);

  return (
    <AccountShell active="/me">
      <PageHeader title={`Hi ${p.full_name?.split(' ')[0] || 'there'} 👋`} subtitle="Everything you're a member of" />
      {!!team?.length && (
        <section id="studios" className="mb-8">
          <h2 className="mb-3 font-semibold">Your creator dashboards</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {team.map((t: any) => (
              <Link key={t.creator.slug} href={`/studio/${t.creator.slug}`} className="card flex items-center gap-3 p-4 hover:shadow-md">
                <Avatar src={t.creator.avatar_url} name={t.creator.name} size={40} />
                <div className="flex-1"><div className="font-medium">{t.creator.name}</div><div className="text-xs capitalize text-zinc-500">{t.role} · {t.creator.status}</div></div>
                <span className="text-sm">Open →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {!!upcoming.length && (
        <section className="mb-8">
          <h2 className="mb-3 font-semibold">Coming up</h2>
          <div className="card divide-y">
            {upcoming.map((l: any) => (
              <Link key={l.id} href={`/${l.creator.slug}/live/${l.id}`} className="flex justify-between p-3 text-sm hover:bg-zinc-50"><span>🎥 {l.title} <span className="text-zinc-500">· {l.creator.name}</span></span><span className="text-zinc-500">{fmtDate(l.starts_at, true)}</span></Link>
            ))}
          </div>
        </section>
      )}
      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Memberships</h2>
        {!ms?.length ? <Empty title="You haven't joined anyone yet" /> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {ms.map((m: any) => (
              <Link key={m.id} href={`/${m.creator.slug}`} className="card flex gap-3 p-4 hover:shadow-md">
                <Avatar src={m.creator.avatar_url} name={m.creator.name} size={48} />
                <div className="flex-1">
                  <div className="font-semibold">{m.creator.name}</div>
                  <div className="text-sm text-zinc-500">{m.tier?.name} · <StatusBadge status={m.status} /></div>
                  {m.current_period_end && <div className="mt-1 text-xs text-zinc-400">{m.cancel_at_period_end || m.status === 'cancelled' ? 'Access until' : 'Renews'} {fmtDate(m.current_period_end)}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      {!!ents?.length && (
        <section>
          <h2 className="mb-3 font-semibold">Purchases</h2>
          <div className="card divide-y text-sm">
            {ents.map((e: any) => (
              <Link key={e.item_id} href={e.kind === 'product' ? `/${e.creator.slug}/shop/${e.item_id}` : `/${e.creator.slug}/courses`} className="flex justify-between p-3 hover:bg-zinc-50">
                <span className="capitalize">{e.kind}</span><span className="text-zinc-500">{e.creator.name} →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </AccountShell>
  );
}
