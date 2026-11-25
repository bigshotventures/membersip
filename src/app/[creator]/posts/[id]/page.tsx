import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { Markdown } from '@/components/Markdown';
import { VideoPlayer } from '@/components/VideoPlayer';
import { Comments, LikeButton, Poll } from '@/components/creator/Social';
import { Flash } from '@/components/creator/Flash';
import { fmtDate, inr } from '@/lib/utils';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { data } = await admin().from('posts').select('title, excerpt, cover_url').eq('id', params.id).eq('status', 'published').maybeSingle();
  return data ? { title: data.title, description: data.excerpt, openGraph: { images: data.cover_url ? [data.cover_url] : [] } } : {};
}

export default async function PostPage({ params, searchParams }: { params: { creator: string; id: string }; searchParams: any }) {
  const { creator, profile, membership, perms } = await loadCreatorPage(params.creator);
  const db = admin();
  const { data: post } = await db.from('posts').select('*').eq('id', params.id).eq('creator_id', creator.id).maybeSingle();
  if (!post || (post.status !== 'published' && !perms.view)) notFound();
  const { data: body } = await createClient().from('post_bodies').select('*').eq('post_id', post.id).maybeSingle(); // RLS decides
  const { data: poll } = await db.from('polls').select('id').eq('post_id', post.id).maybeSingle();
  const path = `/${creator.slug}/posts/${post.id}`;
  const base = `/${creator.slug}`;

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Flash sp={searchParams} />
      <Link href={base} className="text-sm text-zinc-500 hover:underline">← {creator.name}</Link>
      <header>
        <h1 className="text-3xl font-bold">{post.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{fmtDate(post.published_at || post.created_at)}</p>
      </header>

      {body ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {post.cover_url && !body.video_id && <img src={post.cover_url} alt="" className="w-full rounded-xl" />}
          {body.video_id && <VideoPlayer videoId={body.video_id} context={{ type: 'post', id: post.id }} title={post.title} accent={creator.theme?.accent} />}
          <Markdown>{body.body}</Markdown>
          {body.images?.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {body.images.map((src: string) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="" className="aspect-square w-full rounded-lg object-cover" /></a>)}
            </div>
          )}
          {body.attachments?.length > 0 && (
            <div className="card divide-y">
              {body.attachments.map((a: any, i: number) => (
                <a key={i} href={`/api/files?type=post&id=${post.id}&i=${i}`} className="flex items-center justify-between p-3 text-sm hover:bg-zinc-50">
                  <span>📎 {a.name}</span><span className="text-zinc-400">Download</span>
                </a>
              ))}
            </div>
          )}
          {poll && <Poll pollId={poll.id} path={path} viewerId={profile?.id} />}
          <div><LikeButton creatorId={creator.id} targetType="post" targetId={post.id} path={path} viewerId={profile?.id} /></div>
          <Comments creatorId={creator.id} targetType="post" targetId={post.id} path={path} viewerId={profile?.id} canComment={!!profile} canModerate={perms.moderate} />
        </>
      ) : (
        <div className="card p-8 text-center">
          {post.excerpt && <p className="mb-4 text-zinc-600">{post.excerpt}</p>}
          <div className="text-4xl">🔒</div>
          {post.visibility === 'ppv' ? (
            membership?.hasAccess ? (
              <>
                <p className="mt-3 font-medium">This is a premium drop.</p>
                <Link href={`${base}/checkout?kind=ppv&item=${post.id}`} className="btn-primary mt-4">Unlock for {inr(post.ppv_price_paise)}</Link>
              </>
            ) : (
              <>
                <p className="mt-3 font-medium">Premium drop for members.</p>
                <Link href={`${base}#join`} className="btn-primary mt-4">Become a member</Link>
              </>
            )
          ) : (
            <>
              <p className="mt-3 font-medium">{post.visibility === 'tiers' && membership?.hasAccess ? 'Upgrade your tier to read this post.' : 'This post is for members.'}</p>
              <Link href={`${base}#join`} className="btn-primary mt-4">{membership?.hasAccess ? 'See tiers' : 'Join to unlock'}</Link>
              {!profile && <p className="mt-3 text-sm text-zinc-500">Already a member? <Link href={`/login?next=${path}`} className="underline">Sign in</Link></p>}
            </>
          )}
        </div>
      )}
    </article>
  );
}
