import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { sdkSignature } from '@/lib/zoom';

/** Meeting SDK join credentials for an attendee. The meeting number and passcode never reach the page source. */
export async function POST(req: Request) {
  const p = await getProfile();
  if (!p) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  const { liveId, bookingId } = await req.json();
  const db = admin();
  let meeting: string | null = null, password: string | null = null, start: Date, end: Date;

  if (liveId) {
    const { data: l } = await db.from('live_sessions').select('*').eq('id', liveId).single();
    if (!l || !l.zoom_meeting_id) return NextResponse.json({ error: 'This session has no meeting yet' }, { status: 404 });
    const { data: ok } = await createClient().rpc('can_access_live', { s: liveId });
    if (!ok) return NextResponse.json({ error: 'This session is for members' }, { status: 403 });
    meeting = l.zoom_meeting_id; password = l.zoom_password;
    start = new Date(l.starts_at); end = new Date(start.getTime() + l.duration_min * 60000);
  } else {
    const { data: b } = await db.from('bookings').select('*').eq('id', bookingId).single();
    if (!b || b.status !== 'confirmed' || !b.zoom_meeting_id) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    const { data: studio } = await createClient().rpc('can_view_studio', { c: b.creator_id });
    if (b.user_id !== p.id && !studio) return NextResponse.json({ error: 'Not your booking' }, { status: 403 });
    meeting = b.zoom_meeting_id; password = b.zoom_password;
    start = new Date(b.starts_at); end = new Date(b.ends_at);
  }
  const now = Date.now();
  if (now < start.getTime() - 15 * 60000) return NextResponse.json({ error: 'You can join 15 minutes before the start time' }, { status: 400 });
  if (now > end.getTime() + 60 * 60000) return NextResponse.json({ error: 'This session has ended' }, { status: 400 });

  return NextResponse.json({
    signature: sdkSignature(meeting!, 0), sdkKey: process.env.ZOOM_SDK_KEY, meetingNumber: meeting, password,
    userName: p.full_name || 'Member', userEmail: p.email || '',
  });
}
