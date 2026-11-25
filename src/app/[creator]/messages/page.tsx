import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadCreatorPage } from '@/lib/public';
import { createClient } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';
import { Flash } from '@/components/creator/Flash';
import { SubmitButton } from '@/components/client';
import { sendDM } from '@/actions/member';
import { timeAgo } from '@/lib/utils';

export const metadata = { title: 'Messages' };

export default async function Messages({ params, searchParams }: { params: { creator: string }; searchParams: any }) {
  const { creator, profile, membership, perms } = await loadCreatorPage(params.creator);
  if (!profile) redirect(`/login?next=/${creator.slug}/messages`);
  if (perms.moderate) redirect(`/studio/${creator.slug}/messages`);
  const { data: msgs } = await createClient().from('direct_messages').select('*').eq('creator_id', creator.id).eq('member_id', profile.id).order('created_at').limit(200);
  await admin().from('direct_messages').update({ read_at: new Date().toISOString() }).eq('creator_id', creator.id).eq('member_id', profile.id).neq('sender_id', profile.id).is('read_at', null);
  const path = `/${creator.slug}/messages`;
  return (
    <div className="mx-auto max-w-2xl">
      <Flash sp={searchParams} />
      <h1 className="mb-4 text-2xl font-bold">Message {creator.name}</h1>
      {!membership?.hasAccess ? (
        <div className="card p-8 text-center"><p>Direct messages are a member perk.</p><Link href={`/${creator.slug}#join`} className="btn-primary mt-4">Become a member</Link></div>
      ) : (
        <div className="card flex flex-col">
          <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
            {!msgs?.length && <p className="text-center text-sm text-zinc-500">Say hi 👋 — the team usually replies within a day.</p>}
            {(msgs || []).map((m: any) => {
              const mine = m.sender_id === profile.id;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : ''}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'accent-bg text-white' : 'bg-zinc-100'}`}>
                    {!mine && <div className="text-xs font-semibold opacity-70">{creator.name}</div>}
                    <p className="whitespace-pre-wrap">{m.body}</p><div className="text-[10px] opacity-60">{timeAgo(m.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <form action={sendDM} className="flex gap-2 border-t p-3">
            <input type="hidden" name="creator_id" value={creator.id} /><input type="hidden" name="path" value={path} />
            <input name="body" className="input" placeholder="Write a message…" required maxLength={4000} />
            <SubmitButton className="btn-primary">Send</SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
