import Link from 'next/link';
import { notFound } from 'next/navigation';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { updateCreator } from '@/actions/admin';

export default async function CreatorAdmin({ params, searchParams }: { params: { id: string }; searchParams: { notice?: string } }) {
  const { data: c } = await admin().from('creators').select('*').eq('id', params.id).maybeSingle();
  if (!c) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={c.name} subtitle={`/${c.slug}`} actions={<Link href={`/studio/${c.slug}`} className="btn-outline btn-sm">Open studio</Link>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <form action={updateCreator} className="space-y-5"><input type="hidden" name="id" value={c.id} />
        <Card title="Status">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Page status"><select name="status" className="input" defaultValue={c.status}><option value="draft">Draft (hidden)</option><option value="waitlist">Waitlist (pre-launch)</option><option value="live">Live</option><option value="suspended">Suspended</option></select></Field>
            <Field label="Commission %"><input name="commission_pct" type="number" step="0.5" className="input" defaultValue={c.commission_pct ?? ''} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="verified" defaultChecked={c.verified} /> Verified badge ✔</label>
            <Field label="Custom domain" className="sm:col-span-3" hint="Point a CNAME to your host, add the domain in Vercel, then enter it here"><input name="custom_domain" className="input" defaultValue={c.custom_domain || ''} placeholder="members.creatorsite.com" /></Field>
          </div>
        </Card>
        <Card title="KYC & payouts">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="KYC status"><select name="kyc_status" className="input" defaultValue={c.kyc_status}>{['pending', 'submitted', 'verified', 'rejected'].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Legal name"><input name="legal_name" className="input" defaultValue={c.legal_name || ''} /></Field>
            <Field label="PAN"><input name="pan" className="input uppercase" defaultValue={c.pan || ''} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" /></Field>
            <Field label="GSTIN (if registered)"><input name="gstin" className="input uppercase" defaultValue={c.gstin || ''} /></Field>
            <Field label="Address" className="sm:col-span-2"><textarea name="address" className="input" rows={2} defaultValue={c.address || ''} /></Field>
            <Field label="Account holder"><input name="bank_account_name" className="input" defaultValue={c.bank_account_name || ''} /></Field>
            <Field label="Account number" hint={c.bank_account_last4 ? `Saved: ••••${c.bank_account_last4} (only last 4 stored)` : 'Only the last 4 digits are stored'}><input name="bank_account" className="input" autoComplete="off" /></Field>
            <Field label="IFSC"><input name="bank_ifsc" className="input uppercase" defaultValue={c.bank_ifsc || ''} /></Field>
            <Field label="Razorpay Route account ID" hint="Optional — for settling via Razorpay Route later"><input name="razorpay_account_id" className="input" defaultValue={c.razorpay_account_id || ''} /></Field>
          </div>
        </Card>
        <SubmitButton>Save</SubmitButton>
      </form>
    </div>
  );
}
