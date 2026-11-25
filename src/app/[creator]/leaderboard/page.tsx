import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { Avatar, Empty } from '@/components/ui';

export const metadata = { title: 'Leaderboard' };

export default async function Leaderboard({ params }: { params: { creator: string } }) {
  const { creator, profile } = await loadCreatorPage(params.creator);
  const db = admin();
  const [{ data: rows }, { data: levels }, { data: badges }, { data: myBadges }, { data: me }] = await Promise.all([
    db.rpc('leaderboard', { c: creator.id, lim: 50 }),
    db.from('levels').select('*').eq('creator_id', creator.id).order('level'),
    db.from('badges').select('*').or(`creator_id.eq.${creator.id},creator_id.is.null`),
    profile ? db.from('user_badges').select('badge_id').eq('user_id', profile.id) : Promise.resolve({ data: [] }),
    profile ? db.from('member_stats').select('*').eq('creator_id', creator.id).eq('user_id', profile.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const earned = new Set((myBadges || []).map((b: any) => b.badge_id));
  const nextLevel = (levels || []).find((l: any) => l.min_points > (me?.points || 0));
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="mb-6 text-2xl font-bold">Leaderboard</h1>
        {!rows?.length ? <Empty title="No points yet">Comment, post, finish lessons and check in to challenges to earn points.</Empty> : (
          <div className="card divide-y">
            {rows.map((r: any, i: number) => (
              <div key={r.user_id} className={`flex items-center gap-3 p-3 ${r.user_id === profile?.id ? 'bg-zinc-50' : ''}`}>
                <span className="w-8 text-center text-lg">{['🥇', '🥈', '🥉'][i] || i + 1}</span>
                <Avatar src={r.avatar_url} name={r.full_name} size={36} />
                <div className="flex-1"><div className="font-medium">{r.full_name || 'Member'}</div><div className="text-xs text-zinc-500">{r.level_name || 'Member'} · 🔥 {r.current_streak}-day streak</div></div>
                <span className="font-bold">{r.points} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <aside className="space-y-4">
        {me && (
          <div className="card p-5">
            <h3 className="font-semibold">You</h3>
            <p className="mt-1 text-3xl font-bold">{me.points} pts</p>
            <p className="text-sm text-zinc-500">🔥 {me.current_streak}-day streak (best {me.longest_streak})</p>
            {nextLevel && <p className="mt-2 text-sm">{nextLevel.min_points - me.points} pts to <b>{nextLevel.name}</b>{nextLevel.perk && ` — unlocks ${nextLevel.perk}`}</p>}
          </div>
        )}
        {!!levels?.length && (
          <div className="card p-5"><h3 className="mb-2 font-semibold">Levels</h3>
            {levels.map((l: any) => <div key={l.level} className="flex justify-between py-1 text-sm"><span>{l.level}. {l.name}</span><span className="text-zinc-500">{l.min_points}+ pts</span></div>)}
          </div>
        )}
        {!!badges?.length && (
          <div className="card p-5"><h3 className="mb-2 font-semibold">Badges</h3>
            <div className="grid grid-cols-3 gap-3">
              {badges.map((b: any) => <div key={b.id} title={b.description || b.name} className={`text-center ${earned.has(b.id) ? '' : 'opacity-30 grayscale'}`}><div className="text-3xl">{b.icon}</div><div className="text-xs">{b.name}</div></div>)}
            </div>
          </div>
        )}
        <div className="card p-5 text-sm text-zinc-600"><h3 className="mb-2 font-semibold text-zinc-900">How to earn</h3>Comment +2 · Community post +5 · Chat +1 · Finish a lesson +10 · Challenge check-in +10</div>
      </aside>
    </div>
  );
}
