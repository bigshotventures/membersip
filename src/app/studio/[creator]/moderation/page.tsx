import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Empty, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { resolveReport, saveKeywords } from '@/actions/studio/community';
import { restrictMember } from '@/actions/studio/commerce';
import { fmtDate, timeAgo } from '@/lib/utils';

const TABLE: Record<string, string> = { comment: 'comments', space_post: 'space_posts', chat_message: 'chat_messages' };

export default async function Moderation({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string; all?: string } }) {
  const { creator } = await requireStudio(params.creator, 'moderate');
  const db = admin();
  let q = db.from('reports').select('*, reporter:profiles!reports_reporter_id_fkey(full_name)').eq('creator_id', creator.id).order('created_at', { ascending: false }).limit(100);
  if (!searchParams.all) q = q.eq('status', 'open');
  const [{ data: reports }, { data: restrictions }, { data: kw }] = await Promise.all([
    q, db.from('member_restrictions').select('*, user:profiles(full_name)').eq('creator_id', creator.id),
    db.from('blocked_keywords').select('keyword').eq('creator_id', creator.id),
  ]);
  const content: Record<string, any> = {};
  for (const r of reports || []) {
    const t = TABLE[r.target_type];
    if (t) content[r.id] = (await db.from(t).select('body, author_id, hidden, author:profiles(full_name)').eq('id', r.target_id).maybeSingle()).data;
  }
  const slug = creator.slug;
  return (
    <div className="space-y-6">
      <PageHeader title="Moderation" actions={<a href={searchParams.all ? '?' : '?all=1'} className="btn-outline btn-sm">{searchParams.all ? 'Open only' : 'Show resolved'}</a>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {!reports?.length && <Empty title="No reports — your community is in good shape 🎉" />}
      {(reports || []).map((r: any) => {
        const c = content[r.id];
        return (
          <Card key={r.id}>
            <div className="text-xs text-zinc-500">{r.target_type.replace('_', ' ')} · reported by {r.reporter?.full_name} · {timeAgo(r.created_at)} · <StatusBadge status={r.status} /></div>
            <p className="mt-1 text-sm font-medium">Reason: {r.reason}</p>
            {c ? <blockquote className="mt-2 rounded bg-zinc-50 p-3 text-sm"><b>{c.author?.full_name}:</b> {c.body}{c.hidden && <span className="badge-red ml-2">hidden</span>}</blockquote> : <p className="mt-2 text-sm text-zinc-400">Content was deleted.</p>}
            {r.status === 'open' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {['hide', 'delete', 'restore', 'dismiss'].map((a) => (
                  <form key={a} action={resolveReport}><Slug slug={slug} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value={a} /><SubmitButton className={a === 'delete' ? 'btn-danger btn-sm' : 'btn-outline btn-sm'}>{a[0].toUpperCase() + a.slice(1)}</SubmitButton></form>
                ))}
                {c?.author_id && (
                  <form action={restrictMember} className="flex gap-1"><Slug slug={slug} /><input type="hidden" name="user_id" value={c.author_id} /><input type="hidden" name="back" value="/moderation" />
                    <select name="kind" className="input py-1 text-xs"><option value="muted">Mute author</option><option value="banned">Ban author</option></select>
                    <select name="days" className="input py-1 text-xs"><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="0">Forever</option></select>
                    <SubmitButton className="btn-outline btn-sm">Apply</SubmitButton></form>
                )}
              </div>
            )}
          </Card>
        );
      })}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Muted & banned">
          {(restrictions || []).map((x: any) => (
            <div key={x.user_id} className="flex items-center justify-between py-1 text-sm"><span>{x.user?.full_name} · <StatusBadge status={x.kind} /> {x.until ? `until ${fmtDate(x.until)}` : 'permanently'}</span>
              <form action={restrictMember}><Slug slug={slug} /><input type="hidden" name="user_id" value={x.user_id} /><input type="hidden" name="kind" value="clear" /><input type="hidden" name="back" value="/moderation" /><SubmitButton className="btn-ghost btn-sm">Lift</SubmitButton></form></div>
          ))}
          {!restrictions?.length && <p className="text-sm text-zinc-500">Nobody restricted.</p>}
        </Card>
        <Card title="Keyword filter">
          <form action={saveKeywords} className="space-y-2"><Slug slug={slug} />
            <textarea name="keywords" className="input" rows={5} defaultValue={(kw || []).map((k: any) => k.keyword).join('\n')} placeholder="One word or phrase per line" />
            <p className="hint">Posts, comments and chat containing these are hidden automatically and added to this queue.</p>
            <SubmitButton className="btn-outline">Save filter</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
