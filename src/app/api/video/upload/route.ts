import { NextResponse } from 'next/server';
import { getProfile, studioPerms } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { createDirectUpload } from '@/lib/mux';

/** Studio: create a video row + Mux direct-upload URL. The browser uploads straight to Mux. */
export async function POST(req: Request) {
  const p = await getProfile();
  if (!p) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  const { creatorId, title, isPublic } = await req.json();
  const { data: c } = await admin().from('creators').select('*').eq('id', creatorId).single();
  if (!c || !(await studioPerms(c, p)).manage) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { data: v } = await admin().from('videos').insert({ creator_id: creatorId, title: String(title || 'Untitled').slice(0, 200), is_public: !!isPublic }).select('id').single();
  try {
    const up = await createDirectUpload(v.id, !!isPublic);
    await admin().from('videos').update({ mux_upload_id: up.id }).eq('id', v.id);
    return NextResponse.json({ videoId: v.id, uploadUrl: up.url });
  } catch (e: any) {
    await admin().from('videos').delete().eq('id', v.id);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
