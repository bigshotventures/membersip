import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';
import { Card, PageHeader, Stat, StatusBadge, Avatar } from '@/components/ui';
import { BarChart, HBar } from '@/components/charts';
import { fmtDate, inr, timeAgo } from '@/lib/utils';

export default async function Dashboard({ params }: { params: { creator: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const { data: d, error } = await createClient().rpc('creator_dashboard', { c: creator.id });
  const db = admin();
  const [{ data: recent }, { data: lives }, { count: openReports }] = await Promise.all([
    db.from('memberships').select('started_at, status, user:profiles!memberships_user_id_fkey(full_name, avatar_url), tier:tiers!memberships_tier_id_fkey(name)').eq('creator_id', creator.id).order('started_at', { ascending: false }).limit(8),
    db.from('live_sessions').select('id, title, starts_at').eq('creator_id', creator.id).eq('status', 'scheduled').gte('starts_at', new Date().toISOString()).order('starts_at').limit(4),
    db.from('reports').select('id', { count: 'exact', head: true }).eq('creator_id', creator.id).eq('status', 'open'),
  ]);
  if (error || !d) return <p className="text-red-600">Could not load dashboard: {error?.message}</p>;
  const churn = d.active_members ? ((d.churned_30d / (d.active_members + d.churned_30d)) * 100).toFixed(1) : '0';
  const base = `/studio/${creator.slug}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Last 30 days" actions={<Link href={`/${creator.slug}`} className="btn-outline btn-sm" target="_blank">View public page</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {perms.finance && <Stat label="MRR" value={inr(d.mrr_paise)} sub="Monthly recurring revenue" />}
        <Stat label="Active members" value={d.active_members} sub={`${d.trialing} trialing · ${d.paused} paused`} />
        <Stat label="New members" value={d.new_30d} sub={`${d.waitlist} on waitlist`} />
        <Stat label="Churn" value={`${churn}%`} sub={`${d.churned_30d} cancelled · ${d.past_due} payment due`} />
        {perms.finance && <Stat label="Revenue" value={inr(d.revenue_30d_paise)} sub={`Your earnings ${inr(d.net_30d_paise)}`} />}
        <Stat label="Watch time" value={`${Number(d.watch_hours_30d).toFixed(1)} h`} />
        <Stat label="Open reports" value={openReports || 0} sub={<Link href={`${base}/moderation`} className="underline">Review</Link>} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {perms.finance && <Card title="Revenue by day" className="lg:col-span-2"><BarChart money data={d.revenue_by_day.map((x: any) => ({ label: fmtDate(x.day).slice(0, 6), value: x.paise }))} /></Card>}
        <Card title="Members by tier"><HBar rows={d.members_by_tier.map((x: any) => ({ label: x.tier, value: x.count }))} /></Card>
        {perms.finance && <Card title="Revenue by source"><HBar money rows={Object.entries(d.revenue_by_kind).map(([k, v]) => ({ label: k, value: Number(v) }))} /></Card>}
        <Card title="Why people cancel (90 days)"><HBar rows={Object.entries(d.cancel_reasons).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: Number(v) }))} /></Card>
        <Card title="Top posts">
          {d.top_posts.map((p: any) => <div key={p.id} className="flex justify-between py-1 text-sm"><span className="truncate">{p.title}</span><span className="text-zinc-500">♥ {p.likes} · 💬 {p.comments}</span></div>)}
          {!d.top_posts.length && <p className="text-sm text-zinc-500">No posts yet</p>}
        </Card>
        <Card title="Latest members">
          {(recent || []).map((m: any, i: number) => (
            <div key={i} className="flex items-center gap-2 py-1 text-sm"><Avatar src={m.user?.avatar_url} name={m.user?.full_name} size={24} /><span className="flex-1 truncate">{m.user?.full_name}</span><span className="text-xs text-zinc-500">{m.tier?.name} · {timeAgo(m.started_at)}</span></div>
          ))}
        </Card>
        <Card title="Upcoming lives" actions={<Link href={`${base}/live`} className="text-sm underline">Manage</Link>}>
          {(lives || []).map((l: any) => <div key={l.id} className="py-1 text-sm">{l.title} <span className="text-zinc-500">· {fmtDate(l.starts_at, true)}</span></div>)}
          {!lives?.length && <p className="text-sm text-zinc-500">Nothing scheduled</p>}
        </Card>
      </div>
    </div>
  );
}
