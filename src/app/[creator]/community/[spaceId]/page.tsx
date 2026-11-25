import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ChatRoom } from '@/components/creator/ChatRoom';
import { Comments, LikeButton, Poll } from '@/components/creator/Social';
import { Flash } from '@/components/creator/Flash';
import { Avatar, Empty } from '@/components/ui';
import { MultiFileUpload, SubmitButton } from '@/components/client';
import { Markdown } from '@/components/Markdown';
import { createSpacePost, deleteSpacePost, reportContent } from '@/actions/member';
import { timeAgo } from '@/lib/utils';

export default async function SpacePage({ params, searchParams }: { params: { creator: string; spaceId: string }; searchParams: any }) {
  const { creator, profile, perms } = await loadCreatorPage(params.creator);
  const db = admin(), sb = createClient();
  const { data: space } = await db.from('spaces').select('*').eq('id', params.spaceId).eq('creator_id', creator.id).maybeSingle();
  if (!space) notFound();
  const { data: allowed } = profile ? await sb.rpc('can_access_space', { s: space.id }) : { data: false };
  const path = `/${creator.slug}/community/${space.id}`;
  const { data: spaces } = await db.from('spaces').select('id, name, kind, cohort_id').eq('creator_id', creator.id).is('cohort_id', null).order('position');

  const Sidebar = () => (
    <aside className="space-y-1">
      {(spaces || []).map((s: any) => (
        <Link key={s.id} href={`/${creator.slug}/community/${s.id}`} className={`block rounded-lg px-3 py-2 text-sm ${s.id === space.id ? 'bg-white font-semibold shadow-sm' : 'text-zinc-600 hover:bg-white'}`}>{s.kind === 'chat' ? '💬' : '#'} {s.name}</Link>
      ))}
    </aside>
  );

  if (!allowed) {
    return (
      <div className="grid gap-6 md:grid-cols-4"><Sidebar />
        <div className="card p-10 text-center md:col-span-3">
          <p className="text-lg font-medium">🔒 {space.name} is for {space.cohort_id ? 'this cohort' : 'members'}</p>
          <Link href={profile ? `/${creator.slug}#join` : `/login?next=${path}`} className="btn-primary mt-4">{profile ? 'See membership options' : 'Sign in'}</Link>
        </div>
      </div>
    );
  }

  if (space.kind === 'chat') {
    const { data: msgs } = await sb.from('chat_messages').select('id, author_id, body, created_at, hidden').eq('space_id', space.id).order('created_at', { ascending: false }).limit(100);
    const ids = Array.from(new Set((msgs || []).map((m: any) => m.author_id)));
    const { data: authors } = ids.length ? await db.from('profiles').select('id, full_name, avatar_url').in('id', ids) : { data: [] };
    return (
      <div className="grid gap-6 md:grid-cols-4"><Sidebar />
        <div className="md:col-span-3">
          <h1 className="mb-3 text-xl font-bold">💬 {space.name}</h1>
          <ChatRoom spaceId={space.id} creatorId={creator.id} me={profile!.id} initial={(msgs || []).reverse()} authors={authors || []} canModerate={perms.moderate} />
        </div>
      </div>
    );
  }

  const { data: posts } = await sb.from('space_posts').select('*').eq('space_id', space.id).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(30);
  const ids = Array.from(new Set((posts || []).map((p: any) => p.author_id)));
  const { data: authors } = ids.length ? await db.from('profiles').select('id, full_name, avatar_url').in('id', ids) : { data: [] };
  const who = new Map((authors || []).map((a: any) => [a.id, a]));
  const { data: polls } = (posts || []).length ? await db.from('polls').select('id, space_post_id').in('space_post_id', (posts || []).map((p: any) => p.id)) : { data: [] };
  const canPost = space.members_can_post || perms.moderate;
  const { focus } = searchParams;

  return (
    <div className="grid gap-6 md:grid-cols-4"><Sidebar />
      <div className="space-y-4 md:col-span-3">
        <Flash sp={searchParams} />
        <div><h1 className="text-xl font-bold"># {space.name}</h1>{space.description && <p className="text-sm text-zinc-500">{space.description}</p>}</div>
        {canPost && (
          <form action={createSpacePost} className="card space-y-3 p-4">
            <input type="hidden" name="space_id" value={space.id} /><input type="hidden" name="creator_id" value={creator.id} /><input type="hidden" name="path" value={path} />
            <textarea name="body" className="input" rows={3} placeholder="Share a win, ask a question…" required maxLength={10000} />
            <MultiFileUpload name="images" scope="community" creatorId={creator.id} />
            <details><summary className="cursor-pointer text-sm text-zinc-500">📊 Add a poll</summary>
              <div className="mt-2 space-y-2"><input name="poll_question" className="input" placeholder="Question" /><textarea name="poll_options" className="input" rows={3} placeholder={'One option per line'} /></div>
            </details>
            <div className="flex items-center justify-between">
              {perms.moderate ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="announce" /> Pin as announcement & notify members</label> : <span />}
              <SubmitButton className="btn-primary">Post</SubmitButton>
            </div>
          </form>
        )}
        {!posts?.length && <Empty title="No posts yet — start the conversation!" />}
        {(posts || []).map((p: any) => {
          const a = who.get(p.author_id) as any;
          const poll = (polls || []).find((x: any) => x.space_post_id === p.id);
          return (
            <article key={p.id} className={`card p-5 ${p.is_announcement ? 'border-[var(--accent)]' : ''}`}>
              <div className="flex items-center gap-3">
                <Avatar src={a?.avatar_url} name={a?.full_name} size={36} />
                <div className="flex-1 text-sm"><b>{a?.full_name || 'Member'}</b><div className="text-xs text-zinc-400">{timeAgo(p.created_at)}</div></div>
                {p.is_announcement && <span className="badge-accent">📣 Announcement</span>}
                {p.hidden && <span className="badge-red">hidden</span>}
              </div>
              <div className="mt-3"><Markdown>{p.body}</Markdown></div>
              {p.images?.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{/* eslint-disable-next-line @next/next/no-img-element */}{p.images.map((src: string) => <img key={src} src={src} alt="" className="w-full rounded-lg object-cover" />)}</div>}
              {poll && <div className="mt-3"><Poll pollId={poll.id} path={path} viewerId={profile?.id} /></div>}
              <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
                <LikeButton creatorId={creator.id} targetType="space_post" targetId={p.id} path={path} viewerId={profile?.id} />
                <Link href={`${path}?focus=${p.id}#c-${p.id}`} className="hover:underline">💬 Comments</Link>
                {(p.author_id === profile?.id || perms.moderate) && <form action={deleteSpacePost}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="path" value={path} /><button className="hover:text-red-600">Delete</button></form>}
                {p.author_id !== profile?.id && <form action={reportContent}><input type="hidden" name="creator_id" value={creator.id} /><input type="hidden" name="target_type" value="space_post" /><input type="hidden" name="target_id" value={p.id} /><input type="hidden" name="path" value={path} /><button>Report</button></form>}
              </div>
              {focus === p.id && <div id={`c-${p.id}`} className="mt-4"><Comments creatorId={creator.id} targetType="space_post" targetId={p.id} path={`${path}?focus=${p.id}`} viewerId={profile?.id} canComment canModerate={perms.moderate} /></div>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
