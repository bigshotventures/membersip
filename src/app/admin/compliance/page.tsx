import { admin } from '@/lib/supabase/admin';
import { Card, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { resolveDataRequest } from '@/actions/admin';
import { fmtDate } from '@/lib/utils';

export default async function Compliance({ searchParams }: { searchParams: { notice?: string } }) {
  const { data: reqs } = await admin().from('data_requests').select('*, user:profiles(full_name, email)').order('created_at', { ascending: false }).limit(100);
  const now = new Date(Date.now() + 330 * 60000);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); return d.toISOString().slice(0, 7); });
  return (
    <div className="space-y-6">
      <PageHeader title="GST & data protection" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <Card title="GST reports">
        <p className="mb-3 text-sm text-zinc-600">Download invoice-wise sales for the month. The CSV has B2C / B2B split, place of supply and CGST/SGST/IGST — what your CA needs for GSTR-1 and GSTR-3B.</p>
        <div className="flex flex-wrap gap-2">{months.map((m) => <a key={m} href={`/api/admin/gst?month=${m}`} className="btn-outline btn-sm">{m}</a>)}</div>
      </Card>
      <Card title="Data requests (DPDP Act)">
        {(reqs || []).map((r: any) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
            <div><b className="capitalize">{r.kind}</b> · {r.user?.full_name} ({r.user?.email}) · {fmtDate(r.created_at)}{r.note && <div className="text-zinc-500">“{r.note}”</div>}</div>
            {r.status === 'open' ? (
              <form action={resolveDataRequest} className="flex gap-1"><input type="hidden" name="id" value={r.id} />
                <select name="decision" className="input py-1 text-xs"><option value="completed">{r.kind === 'deletion' ? 'Delete & anonymise' : 'Mark done'}</option><option value="rejected">Reject</option></select>
                <SubmitButton className="btn-outline btn-sm" confirm={r.kind === 'deletion' ? 'This permanently erases personal data. Continue?' : undefined}>Apply</SubmitButton></form>
            ) : <StatusBadge status={r.status} />}
          </div>
        ))}
        {!reqs?.length && <p className="text-sm text-zinc-500">No requests</p>}
      </Card>
    </div>
  );
}
