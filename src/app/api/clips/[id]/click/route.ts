import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { data: clip } = await admin().from('preview_clips').select('clicks, creator:creators(slug)').eq('id', params.id).maybeSingle();
  if (!clip) return NextResponse.redirect(new URL('/', req.url));
  await admin().from('preview_clips').update({ clicks: clip.clicks + 1 }).eq('id', params.id);
  return NextResponse.redirect(new URL(`/${(clip as any).creator.slug}#join`, req.url));
}
