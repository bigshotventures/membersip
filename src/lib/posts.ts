import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { notifyMembers } from '@/lib/notify';

/** Notify the right members once when a post goes live (also used by the scheduler). */
export async function announcePost(postId: string) {
  const db = admin();
  const { data: p } = await db.from('posts').select('*, creator:creators(slug, name, status)').eq('id', postId).single();
  if (!p || p.notified_at || p.creator.status !== 'live') return;
  await db.from('posts').update({ notified_at: new Date().toISOString() }).eq('id', postId);
  if (p.visibility === 'public') return;
  await notifyMembers(p.creator_id, p.visibility === 'tiers' ? p.tier_ids : null, {
    kind: 'new_post', title: `New from ${p.creator.name}: ${p.title}`, body: p.excerpt || 'A new post is waiting for you.', link: `/${p.creator.slug}/posts/${p.id}`,
  });
}

