import { createClient } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';
import { Avatar } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { addComment, deleteComment, reportContent, toggleReaction, votePoll } from '@/actions/member';
import { timeAgo } from '@/lib/utils';

export async function LikeButton({ creatorId, targetType, targetId, path, viewerId }: { creatorId: string; targetType: string; targetId: string; path: string; viewerId?: string | null }) {
  const { data } = await admin().from('reactions').select('user_id').eq('target_type', targetType).eq('target_id', targetId);
  const liked = !!viewerId && (data || []).some((r: any) => r.user_id === viewerId);
  return (
    <form action={toggleReaction} className="inline">
      <input type="hidden" name="creator_id" value={creatorId} /><input type="hidden" name="target_type" value={targetType} />
      <input type="hidden" name="target_id" value={targetId} /><input type="hidden" name="path" value={path} />
      <button className={`btn-sm btn ${liked ? 'accent-text' : 'text-zinc-500'}`} disabled={!viewerId}>{liked ? '♥' : '♡'} {data?.length || 0}</button>
    </form>
  );
}

export async function Comments({ creatorId, targetType, targetId, path, viewerId, canComment, canModerate }: {
  creatorId: string; targetType: string; targetId: string; path: string; viewerId?: string | null; canComment: boolean; canModerate?: boolean;
}) {
  const { data } = await createClient().from('comments').select('*').eq('target_type', targetType).eq('target_id', targetId).order('created_at').limit(500);
  const rows = data || [];
  const authorIds = Array.from(new Set(rows.map((c: any) => c.author_id)));
  const { data: authors } = authorIds.length ? await admin().from('profiles').select('id, full_name, avatar_url').in('id', authorIds) : { data: [] };
  const who = new Map((authors || []).map((a: any) => [a.id, a]));
  const top = rows.filter((c: any) => !c.parent_id);
  const replies = (id: string) => rows.filter((c: any) => c.parent_id === id);

  const Form = ({ parentId }: { parentId?: string }) => (
    <form action={addComment} className="flex gap-2">
      <input type="hidden" name="creator_id" value={creatorId} /><input type="hidden" name="target_type" value={targetType} />
      <input type="hidden" name="target_id" value={targetId} /><input type="hidden" name="path" value={path} />
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      <input name="body" className="input" placeholder={parentId ? 'Reply…' : 'Write a comment…'} maxLength={5000} required />
      <SubmitButton className="btn-dark btn-sm" pendingText="…">{parentId ? 'Reply' : 'Post'}</SubmitButton>
    </form>
  );

  const One = ({ c, depth }: { c: any; depth: number }) => {
    const a = who.get(c.author_id) as any;
    return (
      <div className={depth ? 'ml-10 mt-3' : 'mt-5'}>
        <div className="flex gap-3">
          <Avatar src={a?.avatar_url} name={a?.full_name} size={32} />
          <div className="flex-1">
            <div className="text-sm"><b>{a?.full_name || 'Member'}</b> <span className="text-xs text-zinc-400">{timeAgo(c.created_at)}</span>{c.hidden && <span className="badge-red ml-2">hidden</span>}</div>
            <p className="whitespace-pre-wrap text-sm text-zinc-800">{c.body}</p>
            <div className="mt-1 flex gap-3 text-xs text-zinc-500">
              {viewerId && <LikeButton creatorId={creatorId} targetType="comment" targetId={c.id} path={path} viewerId={viewerId} />}
              {(c.author_id === viewerId || canModerate) && (
                <form action={deleteComment}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="path" value={path} /><button className="hover:text-red-600">Delete</button></form>
              )}
              {viewerId && c.author_id !== viewerId && (
                <form action={reportContent}><input type="hidden" name="creator_id" value={creatorId} /><input type="hidden" name="target_type" value="comment" /><input type="hidden" name="target_id" value={c.id} /><input type="hidden" name="path" value={path} /><button className="hover:text-zinc-800">Report</button></form>
              )}
            </div>
            {depth === 0 && canComment && <details className="mt-2"><summary className="cursor-pointer text-xs text-zinc-500">Reply</summary><div className="mt-2"><Form parentId={c.id} /></div></details>}
          </div>
        </div>
        {replies(c.id).map((r: any) => <One key={r.id} c={r} depth={1} />)}
      </div>
    );
  };

  return (
    <section className="card p-5">
      <h3 className="font-semibold">Comments ({rows.length})</h3>
      {canComment ? <div className="mt-3"><Form /></div> : <p className="mt-2 text-sm text-zinc-500">Join to take part in the conversation.</p>}
      {top.map((c: any) => <One key={c.id} c={c} depth={0} />)}
    </section>
  );
}

export async function Poll({ pollId, path, viewerId }: { pollId: string; path: string; viewerId?: string | null }) {
  const db = admin();
  const [{ data: poll }, { data: results }, { data: mine }] = await Promise.all([
    db.from('polls').select('*').eq('id', pollId).single(),
    db.rpc('poll_results', { p: pollId }),
    viewerId ? db.from('poll_votes').select('option_id').eq('poll_id', pollId).eq('user_id', viewerId) : Promise.resolve({ data: [] }),
  ]);
  if (!poll) return null;
  const total = (results || []).reduce((a: number, r: any) => a + Number(r.votes), 0);
  const voted = new Set((mine || []).map((m: any) => m.option_id));
  const closed = poll.closes_at && new Date(poll.closes_at) < new Date();
  return (
    <form action={votePoll} className="rounded-lg border p-4">
      <input type="hidden" name="poll_id" value={pollId} /><input type="hidden" name="path" value={path} />
      <p className="mb-3 font-medium">📊 {poll.question}</p>
      <div className="space-y-2">
        {(results || []).map((r: any) => {
          const pct = total ? Math.round((Number(r.votes) / total) * 100) : 0;
          return (
            <label key={r.option_id} className="relative block overflow-hidden rounded-md border px-3 py-2 text-sm">
              <div className="absolute inset-y-0 left-0 accent-bg opacity-10" style={{ width: `${pct}%` }} />
              <span className="relative flex items-center gap-2">
                {!closed && viewerId && <input type={poll.multiple ? 'checkbox' : 'radio'} name="option" value={r.option_id} defaultChecked={voted.has(r.option_id)} />}
                <span className="flex-1">{r.label}</span><span className="text-zinc-500">{pct}%</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>{total} vote{total === 1 ? '' : 's'}{closed ? ' · closed' : ''}</span>
        {!closed && viewerId && <SubmitButton className="btn-dark btn-sm">{voted.size ? 'Change vote' : 'Vote'}</SubmitButton>}
      </div>
    </form>
  );
}
