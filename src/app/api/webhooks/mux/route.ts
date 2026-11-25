import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { verifyWebhook } from '@/lib/mux';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get('mux-signature'))) return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  const evt = JSON.parse(raw);
  const d = evt.data || {};
  const db = admin();
  const videoId = d.passthrough || d.new_asset_settings?.passthrough;
  switch (evt.type) {
    case 'video.upload.asset_created':
      if (videoId) await db.from('videos').update({ mux_asset_id: d.asset_id, status: 'processing' }).eq('id', videoId);
      break;
    case 'video.asset.created':
      if (videoId) await db.from('videos').update({ mux_asset_id: d.id, status: 'processing' }).eq('id', videoId);
      break;
    case 'video.asset.ready': {
      const playback = (d.playback_ids || [])[0];
      const q = db.from('videos').update({ status: 'ready', mux_asset_id: d.id, mux_playback_id: playback?.id, duration_s: d.duration, aspect_ratio: d.aspect_ratio });
      if (videoId) await q.eq('id', videoId); else await q.eq('mux_asset_id', d.id);
      break;
    }
    case 'video.asset.errored':
      if (videoId) await db.from('videos').update({ status: 'errored' }).eq('id', videoId);
      break;
  }
  return NextResponse.json({ ok: true });
}
