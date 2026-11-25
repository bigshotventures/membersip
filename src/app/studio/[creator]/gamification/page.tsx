import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { deleteBadge, saveBadge, saveLevels } from '@/actions/studio/community';

const RULES: Record<string, string> = { points: 'Reaches points', streak: 'Day streak of', tenure_months: 'Member for (months)', manual: 'Awarded manually / by automation' };

export default async function Gamification({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: levels }, { data: badges }, { data: counts }] = await Promise.all([
    db.from('levels').select('*').eq('creator_id', creator.id).order('level'),
    db.from('badges').select('*').eq('creator_id', creator.id),
    db.from('user_badges').select('badge_id').eq('creator_id', creator.id),
  ]);
  const slug = creator.slug;
  const defaultLevels = 'Newbie | 0 |\nRegular | 100 |\nContributor | 300 | Exclusive monthly AMA\nInsider | 750 | 10% off merch\nLegend | 2000 | Free 1:1 call';
  return (
    <div className="space-y-6">
      <PageHeader title="Levels & badges" subtitle="Points: comment +2, community post +5, chat +1, lesson +10, challenge check-in (custom)" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {!perms.manage && <ReadOnlyNotice />}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Levels">
          <form action={saveLevels} className="space-y-2"><Slug slug={slug} />
            <textarea name="levels" className="input font-mono text-sm" rows={8} disabled={!perms.manage} defaultValue={(levels || []).length ? (levels || []).map((l: any) => `${l.name} | ${l.min_points} | ${l.perk || ''}`).join('\n') : defaultLevels} />
            <p className="hint">One per line: Name | minimum points | perk (optional). Shown on the leaderboard.</p>
            {perms.manage && <SubmitButton className="btn-outline">Save levels</SubmitButton>}
          </form>
        </Card>
        <Card title="Badges">
          <div className="mb-4 grid grid-cols-3 gap-3">
            {(badges || []).map((b: any) => (
              <div key={b.id} className="rounded-lg border p-2 text-center text-sm">
                <div className="text-2xl">{b.icon}</div><div className="font-medium">{b.name}</div>
                <div className="text-xs text-zinc-500">{RULES[b.rule?.type]} {b.rule?.gte ?? ''}</div>
                <div className="text-xs">{(counts || []).filter((c: any) => c.badge_id === b.id).length} earned</div>
                {perms.manage && <form action={deleteBadge}><Slug slug={slug} /><input type="hidden" name="id" value={b.id} /><button className="text-xs text-red-600">Delete</button></form>}
              </div>
            ))}
          </div>
          {perms.manage && (
            <form action={saveBadge} className="grid grid-cols-2 gap-2"><Slug slug={slug} />
              <input name="icon" className="input" placeholder="Emoji 🏆" maxLength={4} />
              <input name="name" className="input" placeholder="Badge name" required />
              <select name="rule_type" className="input">{Object.entries(RULES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input name="rule_gte" type="number" className="input" placeholder="Threshold" />
              <input name="description" className="input col-span-2" placeholder="Description" />
              <div className="col-span-2"><SubmitButton className="btn-outline">Add badge</SubmitButton></div>
            </form>
          )}
        </Card>
      </div>
      <Card title="Milestone ideas">
        <p className="text-sm text-zinc-600">Add badges like <b>🎂 1 year member</b> (Member for 12 months) and <b>🔥 7-day streak</b>. Tenure badges are checked daily. Pair them with an automation that sends a loyalty coupon.</p>
      </Card>
    </div>
  );
}
