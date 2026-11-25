import { redirect } from 'next/navigation';
import { loadCreatorPage } from '@/lib/public';
import { quote, Kind } from '@/lib/pricing';
import { Checkout } from '@/components/Checkout';
import { Notice } from '@/components/ui';
import { fmtDate, fmtTime } from '@/lib/utils';

export const metadata = { title: 'Checkout' };
const KINDS: Kind[] = ['membership', 'course', 'cohort', 'product', 'ppv', 'event', 'booking', 'gift', 'service'];

export default async function CheckoutPage({ params, searchParams }: { params: { creator: string }; searchParams: Record<string, string> }) {
  const { creator, profile } = await loadCreatorPage(params.creator);
  const qs = new URLSearchParams(searchParams).toString();
  if (!profile) redirect(`/login?next=${encodeURIComponent(`/${creator.slug}/checkout?${qs}`)}`);
  const kind = searchParams.kind as Kind;
  if (!KINDS.includes(kind)) redirect(`/${creator.slug}`);
  const gift = kind === 'gift'
    ? { kind: (searchParams.gk === 'credit' ? 'credit' : 'membership') as 'membership' | 'credit', months: Number(searchParams.months) || 1, amountPaise: Number(searchParams.amount) || 0 }
    : undefined;

  let initial: any, error = '';
  try {
    initial = await quote({ creatorId: creator.id, kind, itemId: searchParams.item, period: searchParams.period, userId: profile.id, months: gift?.months, giftKind: gift?.kind, amountPaise: gift?.amountPaise });
  } catch (e: any) { error = e.message; }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-bold">Checkout</h1>
      <p className="mb-6 text-sm text-zinc-500">{creator.name}</p>
      {error ? <Notice tone="error">{error}</Notice> : (
        <div className="card p-6">
          {kind === 'booking' && searchParams.slot && (
            <p className="mb-4 rounded-lg bg-zinc-50 p-3 text-sm">📅 {fmtDate(searchParams.slot)} at {fmtTime(searchParams.slot)} (IST)</p>
          )}
          <Checkout
            creatorId={creator.id} kind={kind} itemId={searchParams.item} period={searchParams.period}
            initial={(({ item, ...r }) => r)(initial)} availableCredit={profile.credit_paise} defaultState={profile.state_code}
            shipping={kind === 'product' && initial.item?.kind === 'merch'} gift={gift} bookingStart={kind === 'booking' ? searchParams.slot : undefined}
            abTestId={searchParams.ab} accent={creator.theme?.accent}
          />
        </div>
      )}
    </div>
  );
}
