import Link from 'next/link';
import { timeAgo, inr } from '@/lib/utils';

export function PostCard({ post, slug, unlocked, likes = 0, comments = 0 }: { post: any; slug: string; unlocked: boolean; likes?: number; comments?: number }) {
  return (
    <Link href={`/${slug}/posts/${post.id}`} className="card block overflow-hidden hover:shadow-md">
      {post.cover_url && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.cover_url} alt="" className={`h-52 w-full object-cover ${unlocked ? '' : 'blur-md'}`} />
        </div>
      )}
      <div className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          {post.pinned && <span className="badge-amber">📌 Pinned</span>}
          <span className="badge">{post.kind}</span>
          {!unlocked && <span className="badge">🔒 {post.visibility === 'ppv' ? `Unlock for ${inr(post.ppv_price_paise)}` : 'Members only'}</span>}
          <span>{timeAgo(post.published_at || post.created_at)}</span>
        </div>
        <h3 className="text-lg font-semibold">{post.title}</h3>
        {post.excerpt && <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{post.excerpt}</p>}
        <div className="mt-3 flex gap-4 text-xs text-zinc-500"><span>♥ {likes}</span><span>💬 {comments}</span></div>
      </div>
    </Link>
  );
}
