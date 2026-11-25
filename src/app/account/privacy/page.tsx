import { requireProfile } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { AccountShell } from '@/components/account/AccountShell';
import { Card, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { requestDataAction } from '@/actions/account';
import { fmtDate } from '@/lib/utils';

export const metadata = { title: 'Privacy & data' };

export default async function Privacy({ searchParams }: { searchParams: { requested?: string } }) {
  const p = await requireProfile('/account/privacy');
  const db = admin();
  const [{ data: consents }, { data: reqs }] = await Promise.all([
    db.from('consents').select('*').eq('user_id', p.id).order('created_at', { ascending: false }),
    db.from('data_requests').select('*').eq('user_id', p.id).order('created_at', { ascending: false }),
  ]);
  return (
    <AccountShell active="/account/privacy">
      <PageHeader title="Privacy & your data" subtitle="Your rights under India's Digital Personal Data Protection Act, 2023" />
      {searchParams.requested && <div className="mb-4"><Notice tone="success">Request received. Our grievance officer will respond within 30 days.</Notice></div>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Download your data"><p className="mb-3 text-sm text-zinc-600">Get a copy of everything we hold about you as a JSON file.</p><a href="/api/export" className="btn-outline">Download my data</a></Card>
        <Card title="Correct your data"><form action={requestDataAction} className="space-y-2"><input type="hidden" name="kind" value="correction" /><textarea name="note" className="input" rows={2} placeholder="What needs correcting?" required /><SubmitButton className="btn-outline">Request correction</SubmitButton></form></Card>
        <Card title="Delete my account" className="md:col-span-2">
          <p className="mb-3 text-sm text-zinc-600">We'll cancel active memberships and erase your personal data. Tax invoices are kept for 8 years as required by GST law.</p>
          <form action={requestDataAction} className="space-y-2"><input type="hidden" name="kind" value="deletion" /><input name="note" className="input" placeholder="Reason (optional)" /><SubmitButton className="btn-danger" confirm="Request permanent deletion of your account?">Request deletion</SubmitButton></form>
        </Card>
      </div>
      <h2 className="mb-2 mt-8 font-semibold">Requests</h2>
      <div className="card divide-y text-sm">{(reqs || []).map((r: any) => <div key={r.id} className="flex justify-between p-3"><span className="capitalize">{r.kind}</span><span>{fmtDate(r.created_at)} · <StatusBadge status={r.status} /></span></div>)}{!reqs?.length && <p className="p-3 text-zinc-500">None</p>}</div>
      <h2 className="mb-2 mt-8 font-semibold">Consent history</h2>
      <div className="card divide-y text-sm">{(consents || []).map((c: any) => <div key={c.id} className="flex justify-between p-3"><span>{c.purpose.replace(/_/g, ' ')}</span><span>{c.granted ? '✅ granted' : '❌ withdrawn'} · {fmtDate(c.created_at, true)}</span></div>)}</div>
    </AccountShell>
  );
}
