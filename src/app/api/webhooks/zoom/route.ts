import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { verifyZoomWebhook, zoomUrlValidation } from '@/lib/zoom';
import { createAssetFromUrl } from '@/lib/mux';
import { notifyMembers } from '@/lib/notify';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const raw = await req.text();
  const evt = JSON.parse(raw);
  if (evt.event === 'endpoint.url_validation') return NextResponse.json(zoomUrlValidation(evt.payload.plainToken));
  if (!verifyZoomWebhook(raw, req.headers.get('x-zm-request-timestamp'), req.headers.get('x-zm-signature'))) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  const db = admin();
  const obj = evt.payload?.object || {};
  const meetingId = String(obj.id || '');
  const { data: live } = await db.from('live_sessions').select('*, creator:creators(slug)').eq('zoom_meeting_id', meetingId).maybeSingle();

  switch (evt.event) {
    case 'meeting.started':
      if (live) await db.from('live_sessions').update({ status: 'live' }).eq('id', live.id);
      break;
    case 'meeting.ended':
      if (live) await db.from('live_sessions').update({ status: 'ended' }).eq('id', live.id);
      await db.from('bookings').update({ status: 'completed' }).eq('zoom_meeting_id', meetingId).eq('status', 'confirmed');
      break;
    case 'recording.completed': {
      if (!live || !live.publish_recording || live.recording_video_id) break;
      const file = (obj.recording_files || []).find((f: any) => f.file_type === 'MP4' && f.recording_type?.includes('shared_screen_with_speaker_view'))
        || (obj.recording_files || []).find((f: any) => f.file_type === 'MP4');
      if (!file) break;
      const { data: v } = await db.from('videos').insert({ creator_id: live.creator_id, title: `Replay: ${live.title}`, status: 'processing' }).select('id').single();
      const url = `${file.download_url}?access_token=${evt.download_token}`;
      try {
        const asset = await createAssetFromUrl(url, v.id, false);
        await db.from('videos').update({ mux_asset_id: asset.id }).eq('id', v.id);
        await db.from('live_sessions').update({ recording_video_id: v.id }).eq('id', live.id);
        await notifyMembers(live.creator_id, live.visibility === 'tiers' ? live.tier_ids : null, {
          kind: 'replay', title: `Replay available: ${live.title}`, body: 'Missed the live session? The recording is ready to watch.', link: `/${live.creator.slug}/live/${live.id}`,
        });
      } catch (e) {
        await db.from('videos').update({ status: 'errored' }).eq('id', v.id);
        console.error('replay import failed', e);
      }
      break;
    }
  }
  return NextResponse.json({ ok: true });
}
