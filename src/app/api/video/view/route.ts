import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/auth';

/** Watch-time heartbeat (every 30s from the player). */
export async function POST(req: Request) {
  const p = await getProfile();
  if (!p) return NextResponse.json({ ok: false });
  const { videoId, seconds } = await req.json();
  const add = Math.min(Math.max(Number(seconds) || 0, 0), 60);
  const db = admin();
  const { data: v } = await db.from('videos').select('creator_id').eq('id', videoId).single();
  if (!v || !add) return NextResponse.json({ ok: false });
  const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const { data: row } = await db.from('video_views').select('seconds').eq('user_id', p.id).eq('video_id', videoId).eq('day', day).maybeSingle();
  await db.from('video_views').upsert({ user_id: p.id, video_id: videoId, creator_id: v.creator_id, day, seconds: (row?.seconds || 0) + add }, { onConflict: 'user_id,video_id,day' });
  return NextResponse.json({ ok: true });
}
