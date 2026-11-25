import 'server-only';
import { admin } from '@/lib/supabase/admin';

const IST = 330 * 60000;

/** Free 1:1 slots for a booking type, grouped by IST date. */
export async function availableSlots(bookingTypeId: string) {
  const db = admin();
  const { data: bt } = await db.from('booking_types').select('*').eq('id', bookingTypeId).single();
  if (!bt) return [];
  const now = Date.now();
  const horizon = now + bt.max_days_ahead * 86400000;
  const [{ data: windows }, { data: blocks }, { data: booked }, { data: lives }] = await Promise.all([
    db.from('availability').select('*').eq('creator_id', bt.creator_id),
    db.from('availability_blocks').select('starts_at, ends_at').eq('creator_id', bt.creator_id).gte('ends_at', new Date(now).toISOString()),
    db.from('bookings').select('starts_at, ends_at, status, created_at').eq('creator_id', bt.creator_id).in('status', ['pending_payment', 'confirmed']).gte('ends_at', new Date(now).toISOString()),
    db.from('live_sessions').select('starts_at, duration_min').eq('creator_id', bt.creator_id).eq('status', 'scheduled').gte('starts_at', new Date(now - 86400000).toISOString()),
  ]);
  const busy: [number, number][] = [
    ...(blocks || []).map((b: any) => [+new Date(b.starts_at), +new Date(b.ends_at)] as [number, number]),
    // unpaid holds expire after 15 minutes
    ...(booked || []).filter((b: any) => b.status === 'confirmed' || now - +new Date(b.created_at) < 15 * 60000)
      .map((b: any) => [+new Date(b.starts_at), +new Date(b.ends_at)] as [number, number]),
    ...(lives || []).map((l: any) => [+new Date(l.starts_at), +new Date(l.starts_at) + l.duration_min * 60000] as [number, number]),
  ];
  const dur = bt.duration_min * 60000, step = (bt.duration_min + bt.buffer_min) * 60000, buffer = bt.buffer_min * 60000;
  const earliest = now + bt.min_notice_hours * 3600000;
  const out: { date: string; slots: string[] }[] = [];

  for (let day = 0; day <= bt.max_days_ahead; day++) {
    const istNow = new Date(now + IST);
    const d = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + day));
    const weekday = d.getUTCDay();
    const slots: string[] = [];
    for (const w of (windows || []).filter((x: any) => x.weekday === weekday)) {
      const [sh, sm] = w.start_time.split(':').map(Number), [eh, em] = w.end_time.split(':').map(Number);
      const winStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), sh, sm) - IST;
      const winEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), eh, em) - IST;
      for (let t = winStart; t + dur <= winEnd; t += step) {
        if (t < earliest || t > horizon) continue;
        if (busy.some(([a, b]) => t < b + buffer && t + dur > a - buffer)) continue;
        slots.push(new Date(t).toISOString());
      }
    }
    if (slots.length) out.push({ date: d.toISOString().slice(0, 10), slots: slots.sort() });
  }
  return out;
}
