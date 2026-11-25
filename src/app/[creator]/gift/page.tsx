import Link from 'next/link';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { inr } from '@/lib/utils';

export const metadata = { title: 'Gift a membership' };

export default async function GiftPage({ params }: { params: { creator: string } }) {
  const { creator } = await loadCreatorPage(params.creator);
  const { data: tiers } = await admin().from('tiers').select('*').eq('creator_id', creator.id).eq('is_active', true).not('price_monthly', 'is', null).order('position');
  const base = `/${creator.slug}`;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="text-center">
        <div className="text-5xl">🎁</div>
        <h1 className="mt-2 text-3xl font-bold">Gift {creator.name}</h1>
        <p className="mt-2 text-zinc-600">Perfect for birthdays, Diwali or just because. Schedule delivery for the big day — we'll email a beautiful gift card with your message.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(tiers || []).map((t: any) => (
          <div key={t.id} className="card p-5">
            <h3 className="font-semibold">{t.name}</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[1, 3, 6, 12].map((m) => {
                const price = m === 12 && t.price_yearly ? t.price_yearly : m === 3 && t.price_quarterly ? t.price_quarterly : t.price_monthly * m;
                return (
                  <Link key={m} href={`${base}/checkout?kind=gift&item=${t.id}&months=${m}`} className="rounded-lg border p-3 text-center hover:border-[var(--accent)]">
                    <div className="text-sm font-medium">{m} month{m > 1 ? 's' : ''}</div>
                    <div className="text-xs text-zinc-500">{inr(price)}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <h3 className="font-semibold">Gift card (any amount)</h3>
        <p className="text-sm text-zinc-500">They can spend it on courses, products, sessions or a membership.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[50000, 100000, 200000, 500000].map((a) => <Link key={a} href={`${base}/checkout?kind=gift&gk=credit&item=${creator.id}&amount=${a}`} className="btn-outline">{inr(a)}</Link>)}
        </div>
      </div>
    </div>
  );
}
