import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { APP_NAME, APP_URL } from '@/lib/utils';

const ics = (d: string | Date) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => (s || '').replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');

/** Private iCal feed — subscribe in Google Calendar ("From URL") to sync lives, 1:1s, cohorts and challenges. */
export async function GET(_: Request, { params }: { params: { token: string } }) {
  const db = admin();
  const { data: p } = await db.from('profiles').select('id').eq('calendar_token', params.token.replace('.ics', '')).maybeSingle();
  if (!p) return new NextResponse('Not found', { status: 404 });
  const { data: ms } = await db.from('memberships').select('creator_id, tier_id, creator:creators(slug, name)').eq('user_id', p.id).in('status', ['active', 'trialing', 'past_due']);
  const events: { uid: string; start: string; end: string; title: string; url: string; desc?: string }[] = [];
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  for (const m of ms || []) {
    const { data: lives } = await db.from('live_sessions').select('*').eq('creator_id', m.creator_id).neq('status', 'cancelled').gte('starts_at', since);
    for (const l of lives || []) {
      if (l.visibility === 'tiers' && l.tier_ids.length && !l.tier_ids.includes(m.tier_id)) continue;
      if (l.visibility === 'ppv') continue;
      events.push({ uid: `live-${l.id}`, start: l.starts_at, end: new Date(+new Date(l.starts_at) + l.duration_min * 60000).toISOString(), title: `${(m as any).creator.name}: ${l.title}`, url: `${APP_URL}/${(m as any).creator.slug}/live/${l.id}`, desc: l.description });
    }
    const { data: chs } = await db.from('challenges').select('*').eq('creator_id', m.creator_id).gte('starts_at', since);
    for (const c of chs || []) events.push({ uid: `ch-${c.id}`, start: c.starts_at, end: new Date(+new Date(c.starts_at) + 3600000).toISOString(), title: `Challenge starts: ${c.title}`, url: `${APP_URL}/${(m as any).creator.slug}/challenges/${c.id}` });
  }
  const { data: ents } = await db.from('entitlements').select('item_id, kind, creator:creators(slug, name)').eq('user_id', p.id).eq('kind', 'event');
  for (const e of ents || []) {
    const { data: l } = await db.from('live_sessions').select('*').eq('id', e.item_id).single();
    if (l) events.push({ uid: `live-${l.id}`, start: l.starts_at, end: new Date(+new Date(l.starts_at) + l.duration_min * 60000).toISOString(), title: `${(e as any).creator.name}: ${l.title}`, url: `${APP_URL}/${(e as any).creator.slug}/live/${l.id}` });
  }
  const { data: bks } = await db.from('bookings').select('*, type:booking_types(title), creator:creators(name)').eq('user_id', p.id).eq('status', 'confirmed').gte('starts_at', since);
  for (const b of bks || []) events.push({ uid: `bk-${b.id}`, start: b.starts_at, end: b.ends_at, title: `1:1 ${b.type.title} with ${b.creator.name}`, url: `${APP_URL}/account/bookings` });
  const { data: enr } = await db.from('enrollments').select('cohort:cohorts(id, name, starts_at, course:courses(title))').eq('user_id', p.id).not('cohort_id', 'is', null);
  for (const e of enr || []) if ((e as any).cohort) events.push({ uid: `co-${(e as any).cohort.id}`, start: (e as any).cohort.starts_at, end: new Date(+new Date((e as any).cohort.starts_at) + 3600000).toISOString(), title: `Cohort starts: ${(e as any).cohort.course.title}`, url: `${APP_URL}/me` });

  const uniq = Array.from(new Map(events.map((e) => [e.uid, e])).values());
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${APP_NAME}//EN`, 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${APP_NAME}`, 'X-WR-TIMEZONE:Asia/Kolkata',
    ...uniq.flatMap((e) => ['BEGIN:VEVENT', `UID:${e.uid}@${new URL(APP_URL).host}`, `DTSTAMP:${ics(new Date())}`, `DTSTART:${ics(e.start)}`, `DTEND:${ics(e.end)}`,
      `SUMMARY:${esc(e.title)}`, `URL:${e.url}`, `DESCRIPTION:${esc((e.desc || '') + '\n' + e.url)}`, 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n');
  return new NextResponse(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900' } });
}
