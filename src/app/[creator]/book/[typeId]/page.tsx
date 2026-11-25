import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { availableSlots } from '@/lib/slots';
import { Empty } from '@/components/ui';
import { inr } from '@/lib/utils';

export default async function PickSlot({ params }: { params: { creator: string; typeId: string } }) {
  const { creator } = await loadCreatorPage(params.creator);
  const { data: t } = await admin().from('booking_types').select('*').eq('id', params.typeId).eq('creator_id', creator.id).eq('active', true).maybeSingle();
  if (!t) notFound();
  const days = await availableSlots(t.id);
  const day = (d: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d));
  const time = (iso: string) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/${creator.slug}/book`} className="text-sm text-zinc-500 hover:underline">← All sessions</Link>
      <h1 className="mt-2 text-2xl font-bold">{t.title}</h1>
      <p className="mb-6 text-zinc-500">{t.duration_min} min · {inr(t.price_paise)} · times in IST</p>
      {!days.length ? <Empty title="No free slots in the next few weeks">Check back soon — new times open regularly.</Empty> : (
        <div className="space-y-4">
          {days.map((d) => (
            <div key={d.date} className="card p-4">
              <h3 className="mb-2 font-semibold">{day(d.date)}</h3>
              <div className="flex flex-wrap gap-2">
                {d.slots.map((s) => <Link key={s} href={`/${creator.slug}/checkout?kind=booking&item=${t.id}&slot=${encodeURIComponent(s)}`} className="btn-outline btn-sm">{time(s)}</Link>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
