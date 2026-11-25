import { requireProfile } from '@/lib/auth';
import { AccountShell } from '@/components/account/AccountShell';
import { Card, Field, Notice, PageHeader } from '@/components/ui';
import { FileUpload, SubmitButton } from '@/components/client';
import { updateProfile } from '@/actions/account';
import { GST_STATES } from '@/lib/states';

export const metadata = { title: 'Profile' };

export default async function AccountPage({ searchParams }: { searchParams: { saved?: string } }) {
  const p = await requireProfile('/account');
  return (
    <AccountShell active="/account">
      <PageHeader title="Profile" subtitle={p.email || p.phone || ''} />
      {searchParams.saved && <div className="mb-4"><Notice tone="success">Saved.</Notice></div>}
      <Card>
        <form action={updateProfile} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input name="full_name" className="input" defaultValue={p.full_name || ''} required /></Field>
          <Field label="Mobile (for WhatsApp reminders)"><input name="phone" className="input" defaultValue={p.phone || ''} placeholder="+91 98765 43210" /></Field>
          <Field label="Photo" className="sm:col-span-2"><FileUpload name="avatar_url" scope="avatar" accept="image/*" defaultValue={p.avatar_url} /></Field>
          <Field label="Bio" className="sm:col-span-2"><textarea name="bio" className="input" rows={3} defaultValue={p.bio || ''} /></Field>
          <Field label="State (used on GST invoices)">
            <select name="state_code" className="input" defaultValue={p.state_code || ''}><option value="">Select</option>{GST_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email_opt_in" defaultChecked={p.email_opt_in} /> Email me updates, new posts and offers</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="whatsapp_opt_in" defaultChecked={p.whatsapp_opt_in} /> Send live-session reminders and updates on WhatsApp</label>
            <p className="hint">Receipts, billing and security emails are always sent.</p>
          </div>
          <div className="sm:col-span-2"><SubmitButton>Save profile</SubmitButton></div>
        </form>
      </Card>
    </AccountShell>
  );
}
