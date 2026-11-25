import Link from 'next/link';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { accessCtx, canSee } from '@/lib/access';
import { Empty, StatusBadge } from '@/components/ui';
import { fmtDate, fmtTime, inr } from '@/lib/utils';

export const metadata = { title: 'Live sessions' };

export default async function LiveList({ params }: { params: { creator: string } }) {
  const { creator, profile, membership, perms } = await loadCreatorPage(params.creator);
  const db = admin();
  const now = new Date().toISOString();
  const [{ data: upcoming }, { data: past }, ctx] = await Promise.all([
    db.from('live_sessions').select('*').eq('creator_id', creator.id).in('status', ['scheduled', 'live']).gte('starts_at', new Date(Date.now() - 4 * 3600000).toISOString()).order('starts_at'),
    db.from('live_sessions').select('*').eq('creator_id', creator.id).lt('starts_at', now).not('recording_video_id', 'is', null).order('starts_at', { ascending: false }).limit(24),
    accessCtx(profile?.id, creator.id, membership, perms.view),
  ]);
  const Row = ({ l }: { l: any }) => {
    const ok = canSee(l, ctx, 'event');
    return (
      <Link href={`/${creator.slug}/live/${l.id}`} className="card flex items-center gap-4 p-4 hover:shadow-md">
        <div className="w-16 shrink-0 rounded-lg bg-zinc-100 p-2 text-center">
          <div className="text-xs uppercase text-zinc-500">{fmtDate(l.starts_at).split(' ')[1]}</div>
          <div className="text-xl font-bold">{fmtDate(l.starts_at).split(' ')[0]}</div>
        </div>
        <div className="flex-1">
          <div className="font-semibold">{l.title}</div>
          <div className="text-sm text-zinc-500">{fmtTime(l.starts_at)} IST · {l.duration_min} min</div>
        </div>
        {l.status === 'live' ? <span className="badge-red">● LIVE</span> : !ok ? <span className="badge">{l.visibility === 'ppv' ? `🎟 ${inr(l.ticket_price_paise)}` : '🔒 Members'}</span> : <StatusBadge status={l.status} />}
      </Link>
    );
  };
  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-2xl font-bold">Upcoming live sessions</h1>
        {upcoming?.length ? <div className="space-y-3">{upcoming.map((l: any) => <Row key={l.id} l={l} />)}</div> : <Empty title="No live sessions scheduled" />}
      </div>
      {!!past?.length && (
        <div>
          <h2 className="mb-4 text-xl font-bold">Replays</h2>
          <div className="space-y-3">{past.map((l: any) => <Row key={l.id} l={l} />)}</div>
        </div>
      )}
    </div>
  );
}
