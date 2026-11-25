import Link from 'next/link';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { Empty } from '@/components/ui';
import { inr } from '@/lib/utils';

export const metadata = { title: 'Shop' };

export default async function Shop({ params }: { params: { creator: string } }) {
  const { creator, membership } = await loadCreatorPage(params.creator);
  const { data: products } = await admin().from('products').select('id, kind, title, description, cover_url, price_paise, stock, eligible_tier_ids').eq('creator_id', creator.id).eq('active', true).order('position');
  const disc = membership?.hasAccess ? membership.tier?.merch_discount_pct || 0 : 0;
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Shop</h1>
      {!products?.length ? <Empty title="Nothing in the shop yet" /> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p: any) => (
            <Link key={p.id} href={`/${creator.slug}/shop/${p.id}`} className="card overflow-hidden hover:shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.cover_url ? <img src={p.cover_url} alt="" className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center bg-zinc-100 text-5xl">{p.kind === 'merch' ? '👕' : '📘'}</div>}
              <div className="p-4">
                <div className="flex gap-2">{p.kind === 'merch' && <span className="badge">Merch</span>}{p.eligible_tier_ids?.length > 0 && <span className="badge-amber">Members only</span>}{p.stock === 0 && <span className="badge-red">Sold out</span>}</div>
                <h3 className="mt-1 font-semibold">{p.title}</h3>
                <div className="mt-1 font-bold">{p.kind === 'merch' && disc ? <><s className="mr-2 text-zinc-400">{inr(p.price_paise)}</s>{inr(Math.round(p.price_paise * (100 - disc) / 100))}</> : inr(p.price_paise)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
