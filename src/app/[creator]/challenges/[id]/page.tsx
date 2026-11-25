import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { Markdown } from '@/components/Markdown';
import { Flash } from '@/components/creator/Flash';
import { Avatar } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { checkIn, joinChallenge } from '@/actions/member';
import { fmtDate } from '@/lib/utils';

export default async function ChallengePage({ params, searchParams }: { params: { creator: string; id: string }; searchParams: any }) {
  const { creator, profile, membership, perms } = await loadCreatorPage(params.creator);
  const db = admin();
  const { data: c } = await db.from('challenges').select('*').eq('id', params.id).eq('creator_id', creator.id).maybeSingle();
  if (!c) notFound();
  const [{ data: parts }, { data: checks }] = await Promise.all([
    db.from('challenge_participants').select('user_id, completed_at, user:profiles(full_name, avatar_url)').eq('challenge_id', c.id),
    db.from('challenge_checkins').select('user_id, day').eq('challenge_id', c.id),
  ]);
  const joined = !!profile && (parts || []).some((p: any) => p.user_id === profile.id);
  const mine = new Set((checks || []).filter((x: any) => x.user_id === profile?.id).map((x: any) => x.day));
  const today = Math.floor((Date.now() - +new Date(c.starts_at)) / 86400000) + 1;
  const eligible = perms.view || (membership?.hasAccess && (!c.tier_ids.length || c.tier_ids.includes(membership.tier_id)));
  const path = `/${creator.slug}/challenges/${c.id}`;
  const counts = new Map<string, number>();
  for (const x of checks || []) counts.set(x.user_id, (counts.get(x.user_id) || 0) + 1);
  const board = (parts || []).map((p: any) => ({ ...p, n: counts.get(p.user_id) || 0 })).sort((a: any, b: any) => b.n - a.n).slice(0, 20);

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Flash sp={searchParams} />
        <div>
          <span className="badge-amber">🔥 {c.days}-day challenge · {c.points_per_checkin} pts per check-in</span>
          <h1 className="mt-2 text-3xl font-bold">{c.title}</h1>
          <p className="text-zinc-500">Starts {fmtDate(c.starts_at)}</p>
        </div>
        <Markdown>{c.description}</Markdown>
        {!joined ? (
          eligible ? (
            <form action={joinChallenge}><input type="hidden" name="challenge_id" value={c.id} /><input type="hidden" name="path" value={path} /><SubmitButton>Join the challenge</SubmitButton></form>
          ) : <Link href={profile ? `/${creator.slug}#join` : `/login?next=${path}`} className="btn-primary">{profile ? 'Members only — join to take part' : 'Sign in to join'}</Link>
        ) : (
          <div className="card p-5">
            <h3 className="mb-3 font-semibold">Your progress · {mine.size}/{c.days}</h3>
            <div className="grid grid-cols-7 gap-2 sm:grid-cols-10">
              {Array.from({ length: c.days }, (_, i) => i + 1).map((d) => (
                <div key={d} title={c.daily_prompts?.[d - 1] || `Day ${d}`} className={`flex aspect-square items-center justify-center rounded-lg text-xs font-medium ${mine.has(d) ? 'accent-bg text-white' : d === today ? 'border-2 border-[var(--accent)]' : d < today ? 'bg-red-50 text-red-400' : 'bg-zinc-100 text-zinc-400'}`}>{d}</div>
              ))}
            </div>
            {today >= 1 && today <= c.days && !mine.has(today) && (
              <form action={checkIn} className="mt-4 space-y-2">
                <input type="hidden" name="challenge_id" value={c.id} /><input type="hidden" name="day" value={today} /><input type="hidden" name="path" value={path} />
                {c.daily_prompts?.[today - 1] && <p className="text-sm"><b>Today:</b> {c.daily_prompts[today - 1]}</p>}
                <input name="note" className="input" placeholder="What did you do today? (optional)" />
                <SubmitButton>Check in for day {today}</SubmitButton>
              </form>
            )}
            {mine.has(today) && <p className="mt-4 text-sm text-emerald-700">✅ Checked in for today. See you tomorrow!</p>}
          </div>
        )}
      </div>
      <aside className="card h-fit p-5">
        <h3 className="mb-3 font-semibold">Leaderboard</h3>
        {board.map((p: any, i: number) => (
          <div key={p.user_id} className="flex items-center gap-2 py-1.5 text-sm">
            <span className="w-5 text-zinc-400">{i + 1}</span><Avatar src={p.user?.avatar_url} name={p.user?.full_name} size={24} />
            <span className="flex-1 truncate">{p.user?.full_name || 'Member'}</span><span className="font-medium">{p.n}{p.completed_at && ' 🏆'}</span>
          </div>
        ))}
        {!board.length && <p className="text-sm text-zinc-500">Be the first to join!</p>}
      </aside>
    </div>
  );
}
