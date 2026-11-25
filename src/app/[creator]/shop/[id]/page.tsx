import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { Markdown } from '@/components/Markdown';
import { Flash } from '@/components/creator/Flash';
import { Notice } from '@/components/ui';
import { inr } from '@/lib/utils';

export default async function ProductPage({ params, searchParams }: { params: { creator: string; id: string }; searchParams: any }) {
  const { creator, profile, membership, perms } = await loadCreatorPage(params.creator);
  const db = admin();
  const { data: p } = await db.from('products').select('*').eq('id', params.id).eq('creator_id', creator.id).maybeSingle();
  if (!p || (!p.active && !perms.view)) notFound();
  const { data: owned } = profile ? await db.from('entitlements').select('id').eq('user_id', profile.id).eq('kind', 'product').eq('item_id', p.id).maybeSingle() : { data: null };
  const eligible = !p.eligible_tier_ids?.length || (membership?.hasAccess && p.eligible_tier_ids.includes(membership.tier_id));
  const disc = p.kind === 'merch' && membership?.hasAccess ? membership.tier?.merch_discount_pct || 0 : 0;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.cover_url ? <img src={p.cover_url} alt="" className="w-full rounded-xl" /> : <div className="flex aspect-square items-center justify-center rounded-xl bg-zinc-100 text-7xl">{p.kind === 'merch' ? '👕' : '📘'}</div>}
      <div className="space-y-5">
        <Flash sp={searchParams} />
        {searchParams.purchased && <Notice tone="success">Thanks for your purchase! Your downloads are below.</Notice>}
        <Link href={`/${creator.slug}/shop`} className="text-sm text-zinc-500 hover:underline">← Shop</Link>
        <h1 className="text-3xl font-bold">{p.title}</h1>
        <div className="text-2xl font-bold">{disc ? <><s className="mr-2 text-lg text-zinc-400">{inr(p.price_paise)}</s>{inr(Math.round(p.price_paise * (100 - disc) / 100))} <span className="badge-green">{disc}% member discount</span></> : inr(p.price_paise)}</div>
        {owned && p.kind === 'digital' ? (
          <div className="card divide-y">
            {(p.files || []).map((f: any, i: number) => (
              <a key={i} href={`/api/files?type=product&id=${p.id}&i=${i}`} className="flex justify-between p-3 text-sm hover:bg-zinc-50"><span>⬇️ {f.name}</span><span className="text-zinc-400">{/\.pdf$/i.test(f.path) ? 'PDF · personalised' : 'Download'}</span></a>
            ))}
          </div>
        ) : !eligible ? (
          <Notice tone="warn">This item is available to selected membership tiers. <Link href={`/${creator.slug}#join`} className="underline">See tiers</Link></Notice>
        ) : p.stock === 0 ? (
          <button className="btn-outline" disabled>Sold out</button>
        ) : (
          <Link href={`/${creator.slug}/checkout?kind=product&item=${p.id}`} className="btn-primary px-8 py-3 text-base">{p.kind === 'merch' ? 'Buy now' : 'Buy & download'}</Link>
        )}
        {owned && p.kind === 'merch' && <Notice tone="success">You've ordered this. Track it in <Link href="/account/orders" className="underline">your orders</Link>.</Notice>}
        <Markdown>{p.description}</Markdown>
        {p.kind === 'digital' && <p className="text-xs text-zinc-500">Digital downloads are personalised with your name and email. Please don't share them.</p>}
      </div>
    </div>
  );
}
