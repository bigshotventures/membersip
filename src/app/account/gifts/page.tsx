import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { AccountShell } from '@/components/account/AccountShell';
import { Card, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { CopyButton, SubmitButton } from '@/components/client';
import { redeemGiftAction } from '@/actions/account';
import { APP_URL, fmtDate, inr } from '@/lib/utils';

export const metadata = { title: 'Gifts & referrals' };

export default async function Gifts({ searchParams }: { searchParams: { sent?: string } }) {
  const p = await requireProfile('/account/gifts');
  const db = admin();
  const [{ data: gifts }, { data: refs }, { data: ms }] = await Promise.all([
    db.from('gift_cards').select('*, creator:creators(name)').eq('purchaser_id', p.id).neq('status', 'pending_payment').order('created_at', { ascending: false }),
    db.from('referrals').select('reward_paise, created_at').eq('referrer_id', p.id),
    db.from('memberships').select('creator:creators(slug, name)').eq('user_id', p.id).in('status', ['active', 'trialing', 'past_due']),
  ]);
  const earned = (refs || []).reduce((a: number, r: any) => a + r.reward_paise, 0);
  return (
    <AccountShell active="/account/gifts">
      <PageHeader title="Gifts & referrals" />
      {searchParams.sent && <div className="mb-4"><Notice tone="success">Gift purchased! We'll email it on the delivery date.</Notice></div>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Refer friends, earn credit">
          <p className="text-sm text-zinc-600">Share your link. When a friend joins, you get 10% of their first payment as account credit to spend on any membership, course or product.</p>
          <div className="mt-3 space-y-2">
            {(ms || []).map((m: any) => {
              const url = `${APP_URL}/${m.creator.slug}?ref=${p.referral_code}`;
              return <div key={m.creator.slug} className="flex items-center gap-2 text-sm"><span className="flex-1 truncate">{m.creator.name}</span><CopyButton text={url} label="Copy link" /></div>;
            })}
            {!ms?.length && <p className="text-sm text-zinc-500">Join a membership to get your referral link.</p>}
          </div>
          <p className="mt-3 text-sm">{refs?.length || 0} referrals · <b>{inr(earned)}</b> earned · Balance <b>{inr(p.credit_paise)}</b></p>
        </Card>
        <Card title="Redeem a gift">
          <form action={redeemGiftAction} className="flex gap-2"><input name="code" className="input uppercase" placeholder="GIFT CODE" required /><SubmitButton>Redeem</SubmitButton></form>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 font-semibold">Gifts you've sent</h2>
      <div className="card divide-y">
        {(gifts || []).map((g: any) => (
          <div key={g.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
            <span>{g.kind === 'credit' ? `${inr(g.amount_paise)} gift card` : `${g.months} month${g.months > 1 ? 's' : ''}`} · {g.creator.name} → {g.recipient_email}</span>
            <span className="text-zinc-500">{g.status === 'scheduled' ? `Delivers ${fmtDate(g.deliver_at, true)}` : <StatusBadge status={g.status} />}</span>
          </div>
        ))}
        {!gifts?.length && <p className="p-4 text-sm text-zinc-500">No gifts yet. Visit any creator page and tap <b>Gift a membership</b>.</p>}
      </div>
    </AccountShell>
  );
}
