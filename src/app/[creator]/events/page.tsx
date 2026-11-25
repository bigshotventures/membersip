import Link from 'next/link';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { CopyButton } from '@/components/client';
import { Empty } from '@/components/ui';
import { APP_URL, fmtDate, fmtTime } from '@/lib/utils';

export const metadata = { title: 'Events calendar' };

export default async function Events({ params }: { params: { creator: string } }) {
  const { creator, profile } = await loadCreatorPage(params.creator);
  const db = admin();
  const now = new Date().toISOString();
  const [{ data: lives }, { data: challenges }, { data: cohorts }] = await Promise.all([
    db.from('live_sessions').select('id, title, starts_at, duration_min, visibility').eq('creator_id', creator.id).in('status', ['scheduled', 'live']).gte('starts_at', now).order('starts_at').limit(50),
    db.from('challenges').select('id, title, starts_at, days').eq('creator_id', creator.id).gte('starts_at', new Date(Date.now() - 60 * 86400000).toISOString()),
    db.from('cohorts').select('id, name, starts_at, course:courses!inner(slug, title, creator_id)').eq('course.creator_id', creator.id).gte('starts_at', now),
  ]);
  const items = [
    ...(lives || []).map((l: any) => ({ at: l.starts_at, title: l.title, kind: l.visibility === 'ppv' ? '🎟 Ticketed live' : '🎥 Live', href: `/${creator.slug}/live/${l.id}` })),
    ...(challenges || []).filter((c: any) => +new Date(c.starts_at) + c.days * 86400000 > Date.now()).map((c: any) => ({ at: c.starts_at, title: c.title, kind: `🔥 ${c.days}-day challenge`, href: `/${creator.slug}/challenges/${c.id}` })),
    ...(cohorts || []).map((h: any) => ({ at: h.starts_at, title: `${h.course.title} — ${h.name}`, kind: '🎓 Cohort starts', href: `/${creator.slug}/courses/${h.course.slug}` })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const feed = profile ? `${APP_URL}/api/calendar/${profile.calendar_token}.ics` : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Calendar</h1>
      {feed ? (
        <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
          <span className="flex-1">📅 Sync every live, 1:1 and challenge to Google Calendar: in Google Calendar choose <b>Other calendars → From URL</b> and paste your private link.</span>
          <CopyButton text={feed} label="Copy calendar link" />
          <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed.replace(/^https?/, 'webcal'))}`} target="_blank" rel="noreferrer" className="btn-outline btn-sm">Open Google Calendar</a>
        </div>
      ) : <p className="text-sm text-zinc-500"><Link href="/login" className="underline">Sign in</Link> to sync events to your calendar.</p>}
      {!items.length ? <Empty title="No upcoming events" /> : (
        <div className="space-y-3">
          {items.map((e, i) => (
            <Link key={i} href={e.href} className="card flex items-center gap-4 p-4 hover:shadow-md">
              <div className="w-24 shrink-0 text-sm"><div className="font-semibold">{fmtDate(e.at)}</div><div className="text-zinc-500">{fmtTime(e.at)}</div></div>
              <div><div className="text-xs text-zinc-500">{e.kind}</div><div className="font-medium">{e.title}</div></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
