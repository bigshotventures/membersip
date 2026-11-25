'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/utils';

type Msg = { id: string; author_id: string; body: string; created_at: string; hidden?: boolean };
type Author = { id: string; full_name: string | null; avatar_url: string | null };

/** Realtime chat room backed by Supabase Realtime (RLS limits who can read/post). */
export function ChatRoom({ spaceId, creatorId, me, initial, authors: initialAuthors, canModerate }: { spaceId: string; creatorId: string; me: string; initial: Msg[]; authors: Author[]; canModerate: boolean }) {
  const sb = createClient();
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [authors, setAuthors] = useState<Record<string, Author>>(Object.fromEntries(initialAuthors.map((a) => [a.id, a])));
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);
  useEffect(() => {
    const ch = sb.channel(`space-${spaceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `space_id=eq.${spaceId}` }, async (p: any) => {
        const m = p.new as Msg;
        setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
        if (!authors[m.author_id]) {
          const { data } = await sb.from('profiles').select('id, full_name, avatar_url').eq('id', m.author_id).single();
          if (data) setAuthors((a) => ({ ...a, [data.id]: data }));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (p: any) => setMsgs((x) => x.filter((y) => y.id !== p.old.id)))
      .subscribe();
    return () => { sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText(''); setErr('');
    const { data, error } = await sb.from('chat_messages').insert({ space_id: spaceId, creator_id: creatorId, author_id: me, body }).select('id, author_id, body, created_at').single();
    if (error) { setErr('Message not sent — you may be muted or not a member.'); setText(body); return; }
    setMsgs((x) => (x.some((y) => y.id === data.id) ? x : [...x, data]));
  }
  async function remove(id: string) {
    await sb.from('chat_messages').delete().eq('id', id);
    setMsgs((x) => x.filter((y) => y.id !== id));
  }

  return (
    <div className="card flex h-[70vh] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.map((m) => {
          const a = authors[m.author_id];
          const mine = m.author_id === me;
          return (
            <div key={m.id} className={`group flex ${mine ? 'justify-end' : ''}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? 'accent-bg text-white' : 'bg-zinc-100'}`}>
                {!mine && <div className="text-xs font-semibold opacity-70">{a?.full_name || 'Member'}</div>}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className="mt-0.5 flex gap-2 text-[10px] opacity-60">{timeAgo(m.created_at)}
                  {(mine || canModerate) && <button onClick={() => remove(m.id)} className="hidden group-hover:inline">delete</button>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" maxLength={2000} />
        <button className="btn-primary">Send</button>
      </form>
      {err && <p className="px-3 pb-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}
