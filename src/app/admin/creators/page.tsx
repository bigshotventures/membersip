import Link from 'next/link';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { createCreator } from '@/actions/admin';
import { fmtDate } from '@/lib/utils';

export default async function Creators({ searchParams }: { searchParams: { notice?: string } }) {
  const { data } = await admin().from('creators').select('id, slug, name, status, verified, kyc_status, commission_pct, created_at, memberships(count)').order('created_at', { ascending: false });
  return (
    <div className="space-y-6">
      <PageHeader title="Creators" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Creator</th><th>Status</th><th>KYC</th><th>Members</th><th>Commission</th><th>Added</th><th /></tr></thead>
        <tbody>{(data || []).map((c: any) => (
          <tr key={c.id}><td className="font-medium">{c.name} {c.verified && '✔'}<div className="text-xs text-zinc-500">/{c.slug}</div></td><td><StatusBadge status={c.status} /></td><td><StatusBadge status={c.kyc_status} /></td>
            <td>{c.memberships?.[0]?.count || 0}</td><td>{c.commission_pct ?? 'default'}%</td><td>{fmtDate(c.created_at)}</td>
            <td className="whitespace-nowrap text-right"><Link href={`/admin/creators/${c.id}`} className="btn-ghost btn-sm">Admin</Link><Link href={`/studio/${c.slug}`} className="btn-ghost btn-sm">Studio</Link></td></tr>
        ))}</tbody></table></div>
      <Card title="Onboard a creator">
        <form action={createCreator} className="grid gap-4 sm:grid-cols-3">
          <Field label="Display name"><input name="name" className="input" required /></Field>
          <Field label="Page URL" hint="yourdomain.com/<this>"><input name="slug" className="input" placeholder="auto from name" /></Field>
          <Field label="Commission %" hint="Empty = platform default"><input name="commission_pct" type="number" step="0.5" className="input" /></Field>
          <Field label="Creator's email (owner login)"><input name="owner_email" type="email" className="input" /></Field>
          <Field label="Creator's name"><input name="owner_name" className="input" /></Field>
          <div className="self-end"><SubmitButton>Create creator</SubmitButton></div>
        </form>
        <p className="hint mt-3">Creates the page (draft), 3 community spaces, levels and starter badges. The creator signs in with their email and sees a read-only dashboard.</p>
      </Card>
    </div>
  );
}
