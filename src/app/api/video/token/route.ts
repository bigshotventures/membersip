import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { playbackToken } from '@/lib/mux';

/** Returns a short-lived signed playback token after checking the viewer can see the content the video belongs to. */
export async function POST(req: Request) {
  const { videoId, context } = await req.json();
  const db = admin();
  const { data: v } = await db.from('videos').select('*').eq('id', videoId).single();
  if (!v || v.status !== 'ready') return NextResponse.json({ error: 'Video is still processing' }, { status: 404 });
  if (v.is_public) return NextResponse.json({ playbackId: v.mux_playback_id, public: true });

  const p = await getProfile();
  if (!p) return NextResponse.json({ error: 'Sign in to watch' }, { status: 401 });
  const sb = createClient();
  let allowed = false;
  if (context?.type === 'post') {
    const { data: b } = await db.from('post_bodies').select('video_id').eq('post_id', context.id).single();
    allowed = b?.video_id === videoId && !!(await sb.rpc('can_read_post', { p: context.id })).data;
  } else if (context?.type === 'lesson') {
    const { data: b } = await db.from('lesson_contents').select('video_id').eq('lesson_id', context.id).single();
    allowed = b?.video_id === videoId && !!(await sb.rpc('can_read_lesson', { lid: context.id })).data;
  } else if (context?.type === 'live') {
    const { data: l } = await db.from('live_sessions').select('recording_video_id').eq('id', context.id).single();
    allowed = l?.recording_video_id === videoId && !!(await sb.rpc('can_access_live', { s: context.id })).data;
  } else if (context?.type === 'studio') {
    allowed = !!(await sb.rpc('can_view_studio', { c: v.creator_id })).data;
  }
  if (!allowed) return NextResponse.json({ error: 'You do not have access to this video' }, { status: 403 });

  return NextResponse.json({
    playbackId: v.mux_playback_id,
    tokens: { playback: playbackToken(v.mux_playback_id, 'v'), thumbnail: playbackToken(v.mux_playback_id, 't'), storyboard: playbackToken(v.mux_playback_id, 's') },
    watermark: p.email || p.phone || p.id.slice(0, 8),
  });
}
