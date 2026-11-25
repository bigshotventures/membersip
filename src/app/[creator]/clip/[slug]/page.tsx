import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { admin } from '@/lib/supabase/admin';
import { loadCreatorPage } from '@/lib/public';
import { VideoPlayer } from '@/components/VideoPlayer';

async function load(creatorSlug: string, slug: string) {
  const { data: c } = await admin().from('creators').select('id').eq('slug', creatorSlug).maybeSingle();
  if (!c) return null;
  const { data } = await admin().from('preview_clips').select('*, clip:videos!preview_clips_clip_video_id_fkey(id, mux_playback_id, status)').eq('creator_id', c.id).eq('slug', slug).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { creator: string; slug: string } }): Promise<Metadata> {
  const clip = await load(params.creator, params.slug);
  if (!clip) return {};
  const thumb = clip.clip?.mux_playback_id ? `https://image.mux.com/${clip.clip.mux_playback_id}/thumbnail.jpg?width=1200` : undefined;
  return { title: clip.title, description: clip.caption, openGraph: { title: clip.title, description: clip.caption || undefined, images: thumb ? [thumb] : [], type: 'video.other' }, twitter: { card: 'summary_large_image' } };
}

/** Public, shareable preview clip (for Instagram / YouTube Shorts bio links) with a CTA to the paywall. */
export default async function ClipPage({ params }: { params: { creator: string; slug: string } }) {
  const { creator } = await loadCreatorPage(params.creator);
  const clip = await load(params.creator, params.slug);
  if (!clip || !clip.clip) notFound();
  await admin().from('preview_clips').update({ views: clip.views + 1 }).eq('id', clip.id);
  return (
    <div className="mx-auto max-w-2xl space-y-5 text-center">
      <h1 className="text-2xl font-bold">{clip.title}</h1>
      {clip.clip.status === 'ready' ? <VideoPlayer videoId={clip.clip.id} context={{ type: 'public' }} title={clip.title} accent={creator.theme?.accent} /> : <p className="text-zinc-500">Clip is processing…</p>}
      {clip.caption && <p className="text-zinc-600">{clip.caption}</p>}
      <Link href={`/api/clips/${clip.id}/click`} className="btn-primary px-8 py-3 text-base">{clip.cta_label}</Link>
    </div>
  );
}
