import { admin } from '@/lib/supabase/admin';
import { Card, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { saveServicePackage, updateServiceOrder } from '@/actions/admin';
import { fmtDate, inr } from '@/lib/utils';

export default async function Services({ searchParams }: { searchParams: { notice?: string } }) {
  const db = admin();
  const [{ data: orders }, { data: pkgs }] = await Promise.all([
    db.from('service_orders').select('*, creator:creators(name, slug), pkg:service_packages(title)').order('created_at', { ascending: false }),
    db.from('service_packages').select('*').order('price_paise'),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Done-for-you services" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <Card title="Requests">
        {(orders || []).map((o: any) => (
          <div key={o.id} className="border-b py-3 text-sm last:border-0">
            <div className="flex flex-wrap justify-between gap-2"><span><b>{o.creator.name}</b> · {o.pkg.title} · {fmtDate(o.created_at)}</span><StatusBadge status={o.status} /></div>
            {o.brief && <p className="mt-1 text-zinc-600">{o.brief}</p>}
            <form action={updateServiceOrder} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="id" value={o.id} />
              <input name="price" className="input w-28 py-1" defaultValue={o.price_paise / 100} />
              <select name="status" className="input w-auto py-1" defaultValue={o.status}>{['requested', 'quoted', 'in_progress', 'delivered', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</select>
              <SubmitButton className="btn-outline btn-sm">Update</SubmitButton></form>
          </div>
        ))}
      </Card>
      <Card title="Packages">
        {(pkgs || []).map((p: any) => (
          <form key={p.id} action={saveServicePackage} className="mb-2 grid gap-2 sm:grid-cols-5"><input type="hidden" name="id" value={p.id} />
            <input name="title" className="input" defaultValue={p.title} /><input name="description" className="input sm:col-span-2" defaultValue={p.description || ''} />
            <input name="price" className="input" defaultValue={p.price_paise / 100} /><SubmitButton className="btn-outline btn-sm">Save</SubmitButton></form>
        ))}
        <form action={saveServicePackage} className="mt-4 grid gap-2 sm:grid-cols-5"><input name="title" className="input" placeholder="New package" required /><input name="description" className="input sm:col-span-2" placeholder="Description" /><input name="price" className="input" placeholder="₹" /><SubmitButton className="btn-outline btn-sm">Add</SubmitButton></form>
      </Card>
    </div>
  );
}
