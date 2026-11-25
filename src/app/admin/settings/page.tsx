import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { saveSettings } from '@/actions/admin';
import { GST_STATES } from '@/lib/states';

export default async function Settings({ searchParams }: { searchParams: { notice?: string } }) {
  const { data: s } = await admin().from('platform_settings').select('*').single();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Platform settings" subtitle="Used on GST invoices and in every fee calculation" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <form action={saveSettings} className="space-y-5">
        <Card title="Company (seller on invoices)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal company name"><input name="company_name" className="input" defaultValue={s.company_name} /></Field>
            <Field label="Brand name"><input name="brand_name" className="input" defaultValue={s.brand_name} /></Field>
            <Field label="GSTIN"><input name="gstin" className="input uppercase" defaultValue={s.gstin || ''} /></Field>
            <Field label="PAN"><input name="pan" className="input uppercase" defaultValue={s.pan || ''} /></Field>
            <Field label="State"><select name="state_code" className="input" defaultValue={s.state_code}>{GST_STATES.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}</select></Field>
            <Field label="Support email"><input name="support_email" className="input" defaultValue={s.support_email || ''} /></Field>
            <Field label="Registered address" className="sm:col-span-2"><textarea name="address" className="input" rows={2} defaultValue={s.address || ''} /></Field>
            <Field label="Invoice prefix"><input name="invoice_prefix" className="input" defaultValue={s.invoice_prefix} /></Field>
          </div>
        </Card>
        <Card title="Tax & fees">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="GST rate %" hint="18% for online education / digital services — confirm with your CA"><input name="gst_rate" type="number" step="0.01" className="input" defaultValue={s.gst_rate} /></Field>
            <Field label="TDS rate % (Sec 194-O)" hint="Confirm the current rate with your CA"><input name="tds_rate" type="number" step="0.001" className="input" defaultValue={s.tds_rate} /></Field>
            <Field label="Default commission %"><input name="default_commission_pct" type="number" step="0.5" className="input" defaultValue={s.default_commission_pct} /></Field>
            <Field label="Grace days after failed renewal"><input name="dunning_grace_days" type="number" className="input" defaultValue={s.dunning_grace_days} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="prices_include_gst" defaultChecked={s.prices_include_gst} /> Prices shown to buyers already include GST</label>
          </div>
        </Card>
        <SubmitButton>Save settings</SubmitButton>
      </form>
    </div>
  );
}
