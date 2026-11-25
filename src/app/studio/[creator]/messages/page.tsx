import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Avatar, Empty, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { sendDM } from '@/actions/member';
import { timeAgo } from '@/lib/utils';

export default async function Inbox({ params, searchParams }: { params: { creator: string }; searchParams: { member?: string } }) {
  const { creator } = await requireStudio(params.creator, 'moderate');
  const db = admin();
  const { data: all } = await db.from('direct_messages').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false }).limit(1000);
  const threads = new Map<string, any>();
  for (const m of all || []) if (!threads.has(m.member_id)) threads.set(m.member_id, m);
  const ids = Array.from(threads.keys());
  const { data: people } = ids.length ? await db.from('profiles').select('id, full_name, avatar_url, email').in('id', ids) : { data: [] };
  const who = new Map((people || []).map((p: any) => [p.id, p]));
  const active = searchParams.member;
  const msgs = active ? (all || []).filter((m: any) => m.member_id === active).reverse() : [];
  if (active) await db.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('creator_id', creator.id).eq('member_id', active).eq('sender_id', active).is('read_at', null);
  const path = `/studio/${creator.slug}/messages?member=${active}`;
  return (
    <div>
      <PageHeader title="Messages" subtitle="Direct messages from members" />
      {!threads.size ? <Empty title="No messages yet" /> : (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card divide-y">
            {ids.map((id) => {
              const last = threads.get(id); const p = who.get(id) as any;
              const unread = last.sender_id === id && !last.read_at;
              return (
                <Link key={id} href={`?member=${id}`} className={`flex gap-2 p-3 text-sm hover:bg-zinc-50 ${active === id ? 'bg-zinc-100' : ''}`}>
                  <Avatar src={p?.avatar_url} name={p?.full_name} size={32} />
                  <div className="min-w-0 flex-1"><div className="flex justify-between"><b className="truncate">{p?.full_name}</b>{unread && <span className="h-2 w-2 rounded-full bg-violet-600" />}</div><div className="truncate text-xs text-zinc-500">{last.body}</div></div>
                </Link>
              );
            })}
          </div>
          <div className="card flex flex-col md:col-span-2">
            {active ? (
              <>
                <div className="border-b p-3 text-sm"><b>{(who.get(active) as any)?.full_name}</b> <span className="text-zinc-500">{(who.get(active) as any)?.email}</span></div>
                <div className="max-h-[60vh] flex-1 space-y-3 overflow-y-auto p-4">
                  {msgs.map((m: any) => (
                    <div key={m.id} className={`flex ${m.sender_id !== active ? 'justify-end' : ''}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender_id !== active ? 'accent-bg text-white' : 'bg-zinc-100'}`}><p className="whitespace-pre-wrap">{m.body}</p><div className="text-[10px] opacity-60">{timeAgo(m.created_at)}</div></div>
                    </div>
                  ))}
                </div>
                <form action={sendDM} className="flex gap-2 border-t p-3"><input type="hidden" name="creator_id" value={creator.id} /><input type="hidden" name="member_id" value={active} /><input type="hidden" name="path" value={path} />
                  <input name="body" className="input" placeholder={`Reply as ${creator.name}…`} required /><SubmitButton>Send</SubmitButton></form>
              </>
            ) : <p className="p-6 text-sm text-zinc-500">Pick a conversation.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
