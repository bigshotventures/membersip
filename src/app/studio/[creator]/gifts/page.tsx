import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Notice, PageHeader, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { voidGift } from '@/actions/studio/commerce';
import { APP_URL, fmtDate, inr } from '@/lib/utils';

export default async function GiftsStudio({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const { data } = await admin().from('gift_cards').select('*, tier:tiers(name), purchaser:profiles!gift_cards_purchaser_id_fkey(full_name)').eq('creator_id', creator.id).neq('status', 'pending_payment').order('created_at', { ascending: false });
  return (
    <div className="space-y-4">
      <PageHeader title="Gifts" subtitle={<>Share <code>{APP_URL}/{creator.slug}/gift</code> around festivals and birthdays</>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Gift</th><th>From</th><th>To</th><th>Occasion</th><th>Delivery</th><th>Status</th><th /></tr></thead>
        <tbody>{(data || []).map((g: any) => <tr key={g.id}><td>{g.kind === 'credit' ? inr(g.amount_paise) : `${g.tier?.name} × ${g.months}m`}</td><td>{g.purchaser?.full_name}</td><td>{g.recipient_name || ''} <span className="text-xs text-zinc-500">{g.recipient_email}</span></td><td>{g.occasion || '—'}</td><td>{fmtDate(g.deliver_at, true)}</td><td><StatusBadge status={g.status} /></td>
          <td>{perms.staff && !['redeemed', 'void'].includes(g.status) && <form action={voidGift}><Slug slug={creator.slug} /><input type="hidden" name="id" value={g.id} /><SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Void this gift?">Void</SubmitButton></form>}</td></tr>)}</tbody></table></div>
    </div>
  );
}
