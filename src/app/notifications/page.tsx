import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { AccountShell } from '@/components/account/AccountShell';
import { Empty, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { markAllRead } from '@/actions/account';
import { timeAgo } from '@/lib/utils';

export const metadata = { title: 'Notifications' };

export default async function Notifications() {
  const p = await requireProfile('/notifications');
  const { data } = await admin().from('notifications').select('*').eq('user_id', p.id).order('created_at', { ascending: false }).limit(100);
  return (
    <AccountShell active="/notifications">
      <PageHeader title="Notifications" actions={<form action={markAllRead}><SubmitButton className="btn-outline btn-sm">Mark all read</SubmitButton></form>} />
      {!data?.length ? <Empty title="You're all caught up" /> : (
        <div className="card divide-y">
          {data.map((n: any) => {
            const inner = (<div className={`flex gap-3 p-4 ${n.read_at ? '' : 'bg-violet-50/50'}`}>{!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-600" />}<div className="flex-1"><div className="text-sm font-medium">{n.title}</div>{n.body && <div className="text-sm text-zinc-600">{n.body}</div>}<div className="text-xs text-zinc-400">{timeAgo(n.created_at)}</div></div></div>);
            return n.link ? <Link key={n.id} href={n.link} className="block hover:bg-zinc-50">{inner}</Link> : <div key={n.id}>{inner}</div>;
          })}
        </div>
      )}
    </AccountShell>
  );
}
