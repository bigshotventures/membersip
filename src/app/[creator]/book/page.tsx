import Link from 'next/link';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { Empty } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
import { inr } from '@/lib/utils';

export const metadata = { title: 'Book a 1:1' };

export default async function Book({ params }: { params: { creator: string } }) {
  const { creator } = await loadCreatorPage(params.creator);
  const { data: types } = await admin().from('booking_types').select('*').eq('creator_id', creator.id).eq('active', true).order('price_paise');
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">Book a 1:1 with {creator.name}</h1>
      <p className="mb-6 text-zinc-500">Private video call on Zoom, right in your browser.</p>
      {!types?.length ? <Empty title="No sessions available right now" /> : (
        <div className="space-y-4">
          {types.map((t: any) => (
            <div key={t.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex-1">
                <h3 className="font-semibold">{t.title}</h3>
                <p className="text-sm text-zinc-500">{t.duration_min} min · {inr(t.price_paise)}</p>
                <div className="mt-2 text-sm"><Markdown>{t.description}</Markdown></div>
              </div>
              <Link href={`/${creator.slug}/book/${t.id}`} className="btn-primary">Pick a time</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
