import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { AccountShell } from '@/components/account/AccountShell';
import { Empty, PageHeader, StatusBadge } from '@/components/ui';
import { fmtDate, inr } from '@/lib/utils';

export const metadata = { title: 'Orders' };

export default async function Orders() {
  const p = await requireProfile('/account/orders');
  const { data: orders } = await admin().from('orders').select('*, creator:creators(slug, name)').eq('user_id', p.id).in('status', ['paid', 'refunded', 'partially_refunded']).order('created_at', { ascending: false }).limit(200);
  return (
    <AccountShell active="/account/orders">
      <PageHeader title="Orders & downloads" />
      {!orders?.length ? <Empty title="No orders yet" /> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Item</th><th>Amount</th><th>Status</th><th /></tr></thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id}>
                  <td>{fmtDate(o.created_at)}</td>
                  <td>{o.meta?.label || o.kind}<div className="text-xs text-zinc-500">{o.creator.name}</div>
                    {o.kind === 'merch' && <div className="text-xs">Shipping: <StatusBadge status={o.fulfillment_status || 'pending'} /> {o.tracking_info && <span className="ml-1">· {o.tracking_info}</span>}</div>}</td>
                  <td>{inr(o.total_paise)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{o.kind === 'product' && <Link className="text-sm underline" href={`/${o.creator.slug}/shop/${o.item_id}`}>Download</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountShell>
  );
}
