import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice, StatusBadge, Tabs } from '@/components/ui';
import { FileUpload, SubmitButton } from '@/components/client';
import { MarkdownArea, Slug, TierPicker } from '@/components/studio/bits';
import { saveProduct, updateFulfillment } from '@/actions/studio/commerce';
import { fmtDate, inr } from '@/lib/utils';

export default async function ShopStudio({ params, searchParams }: { params: { creator: string }; searchParams: { edit?: string; tab?: string; notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const slug = creator.slug;
  const base = `/studio/${slug}/shop`;
  const tab = searchParams.tab || 'products';
  const [{ data: products }, { data: tiers }, { data: orders }] = await Promise.all([
    db.from('products').select('*').eq('creator_id', creator.id).order('position'),
    db.from('tiers').select('id, name').eq('creator_id', creator.id).order('position'),
    db.from('orders').select('*, user:profiles(full_name, email, phone)').eq('creator_id', creator.id).in('kind', ['product', 'merch']).eq('status', 'paid').order('created_at', { ascending: false }).limit(200),
  ]);
  const p: any = searchParams.edit === 'new' ? { kind: 'digital' } : (products || []).find((x: any) => x.id === searchParams.edit);

  return (
    <div className="space-y-6">
      <PageHeader title="Shop" actions={perms.manage && <Link href={`${base}?edit=new`} className="btn-primary">New product</Link>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <Tabs active={`${base}?tab=${tab}`} items={[{ href: `${base}?tab=products`, label: 'Products' }, { href: `${base}?tab=orders`, label: `Orders (${orders?.length || 0})` }]} />
      {tab === 'products' && (
        <>
          {!perms.manage && <ReadOnlyNotice />}
          {p && perms.manage && (
            <Card title={p.id ? 'Edit product' : 'New product'}>
              <form action={saveProduct} className="grid gap-4 sm:grid-cols-2"><Slug slug={slug} />{p.id && <input type="hidden" name="id" value={p.id} />}
                <Field label="Type"><select name="kind" className="input" defaultValue={p.kind}><option value="digital">Digital (ebook, template, recording)</option><option value="merch">Physical merch</option></select></Field>
                <Field label="Price (₹)"><input name="price" className="input" defaultValue={p.price_paise ? p.price_paise / 100 : ''} required /></Field>
                <Field label="Title" className="sm:col-span-2"><input name="title" className="input" defaultValue={p.title} required /></Field>
                <Field label="Description" className="sm:col-span-2"><MarkdownArea name="description" defaultValue={p.description} rows={5} /></Field>
                <Field label="Cover image"><FileUpload name="cover_url" scope="studio" creatorId={creator.id} accept="image/*" defaultValue={p.cover_url} /></Field>
                <Field label="Stock (merch)" hint="Empty = unlimited"><input name="stock" type="number" className="input" defaultValue={p.stock ?? ''} /></Field>
                <Field label="Files buyers download" className="sm:col-span-2">
                  <div className="space-y-2">{(p.files || []).map((f: any, i: number) => <FileUpload key={i} name="file_path" scope="studio" creatorId={creator.id} bucket="private" defaultValue={f.path} />)}<FileUpload name="file_path" scope="studio" creatorId={creator.id} bucket="private" label="Add file" /></div>
                </Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="stamp" defaultChecked={p.files?.[0]?.stamp ?? true} /> Stamp PDFs with buyer's name & email</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inactive" defaultChecked={p.id && !p.active} /> Hidden</label>
                <div className="sm:col-span-2"><TierPicker tiers={tiers || []} selected={p.eligible_tier_ids || []} name="eligible_tier_ids" label="Only for these tiers (merch add-ons)" hint="Leave empty to sell to anyone" /></div>
                <div className="sm:col-span-2"><SubmitButton>Save product</SubmitButton></div>
              </form>
            </Card>
          )}
          <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Product</th><th>Type</th><th>Price</th><th>Stock</th><th>Sold</th><th /></tr></thead>
            <tbody>{(products || []).map((x: any) => (
              <tr key={x.id} className={x.active ? '' : 'opacity-50'}><td className="font-medium">{x.title}</td><td>{x.kind}</td><td>{inr(x.price_paise)}</td><td>{x.stock ?? '∞'}</td>
                <td>{(orders || []).filter((o: any) => o.item_id === x.id).length}</td><td>{perms.manage && <Link href={`${base}?edit=${x.id}`} className="btn-ghost btn-sm">Edit</Link>}</td></tr>
            ))}</tbody></table></div>
        </>
      )}
      {tab === 'orders' && (
        <div className="space-y-3">
          {(orders || []).map((o: any) => (
            <div key={o.id} className="card p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><div><b>{o.meta?.label}</b> · {inr(o.total_paise)} · {fmtDate(o.created_at, true)}<div className="text-zinc-500">{o.user?.full_name} · {o.user?.email} · {o.user?.phone}</div></div>{o.kind === 'merch' && <StatusBadge status={o.fulfillment_status || 'pending'} />}</div>
              {o.kind === 'merch' && o.shipping_address && <p className="mt-2 rounded bg-zinc-50 p-2">{['name', 'phone', 'line1', 'line2', 'city', 'state', 'pincode'].map((k) => o.shipping_address[k]).filter(Boolean).join(', ')}</p>}
              {o.kind === 'merch' && perms.moderate && (
                <form action={updateFulfillment} className="mt-2 flex flex-wrap gap-2"><Slug slug={slug} /><input type="hidden" name="id" value={o.id} />
                  <select name="fulfillment_status" className="input w-auto" defaultValue={o.fulfillment_status || 'pending'}>{['pending', 'shipped', 'delivered', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</select>
                  <input name="tracking_info" className="input flex-1" defaultValue={o.tracking_info || ''} placeholder="Courier + tracking number" />
                  <SubmitButton className="btn-outline btn-sm">Update & notify</SubmitButton></form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
