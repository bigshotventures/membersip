import { requireProfile } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { AccountShell } from '@/components/account/AccountShell';
import { Card, Empty, PageHeader, StatusBadge } from '@/components/ui';
import { ZoomEmbed } from '@/components/ZoomEmbed';
import { fmtDate, fmtTime } from '@/lib/utils';

export const metadata = { title: '1:1 bookings' };

export default async function Bookings() {
  const p = await requireProfile('/account/bookings');
  const { data } = await admin().from('bookings').select('*, type:booking_types(title), creator:creators(name, slug)').eq('user_id', p.id).neq('status', 'pending_payment').order('starts_at', { ascending: false }).limit(50);
  const now = Date.now();
  return (
    <AccountShell active="/account/bookings">
      <PageHeader title="1:1 bookings" />
      {!data?.length ? <Empty title="No bookings yet" /> : (
        <div className="space-y-3">
          {data.map((b: any) => {
            const joinable = b.status === 'confirmed' && now >= +new Date(b.starts_at) - 15 * 60000 && now <= +new Date(b.ends_at) + 3600000;
            return (
              <Card key={b.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <div><div className="font-semibold">{b.type.title} with {b.creator.name}</div><div className="text-sm text-zinc-500">{fmtDate(b.starts_at)} · {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)} IST</div></div>
                  <StatusBadge status={b.status} />
                </div>
                {joinable && <div className="mt-4"><ZoomEmbed bookingId={b.id} label="Join call" /></div>}
                {b.status === 'confirmed' && !joinable && +new Date(b.starts_at) > now && <p className="mt-2 text-xs text-zinc-500">The Join button appears here 15 minutes before your session.</p>}
              </Card>
            );
          })}
        </div>
      )}
    </AccountShell>
  );
}
