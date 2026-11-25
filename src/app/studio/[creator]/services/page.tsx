import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { requestService } from '@/actions/studio/commerce';
import { fmtDate, inr } from '@/lib/utils';

export default async function Services({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: pkgs }, { data: orders }] = await Promise.all([
    db.from('service_packages').select('*').eq('active', true),
    db.from('service_orders').select('*, pkg:service_packages(title)').eq('creator_id', creator.id).order('created_at', { ascending: false }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Done-for-you services" subtitle="Let our team handle the heavy lifting" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <div className="grid gap-4 md:grid-cols-3">
        {(pkgs || []).map((p: any) => (
          <Card key={p.id} title={p.title}>
            <p className="text-sm text-zinc-600">{p.description}</p>
            <p className="mt-3 text-xl font-bold">{inr(p.price_paise)} <span className="text-xs font-normal text-zinc-500">+ GST</span></p>
            <form action={requestService} className="mt-3 space-y-2"><Slug slug={creator.slug} /><input type="hidden" name="package_id" value={p.id} />
              <textarea name="brief" className="input" rows={3} placeholder="Tell us what you need" />
              <SubmitButton className="btn-primary w-full">Request</SubmitButton></form>
          </Card>
        ))}
      </div>
      <Card title="Your requests">
        {(orders || []).map((o: any) => (
          <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
            <span>{o.pkg.title} · {fmtDate(o.created_at)} · {inr(o.price_paise)}</span>
            <span className="flex items-center gap-2"><StatusBadge status={o.status} />{o.status === 'quoted' && !o.order_id && <Link href={`/${creator.slug}/checkout?kind=service&item=${o.id}`} className="btn-primary btn-sm">Pay to start</Link>}</span>
          </div>
        ))}
        {!orders?.length && <p className="text-sm text-zinc-500">No requests yet</p>}
      </Card>
    </div>
  );
}
