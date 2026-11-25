import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug, TierPicker } from '@/components/studio/bits';
import { saveCampaign } from '@/actions/studio/community';
import { fmtDate } from '@/lib/utils';

export default async function Campaigns({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: list }, { data: tiers }] = await Promise.all([
    db.from('email_campaigns').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false }),
    db.from('tiers').select('id, name').eq('creator_id', creator.id).order('position'),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Broadcasts" subtitle="Email and WhatsApp newsletters to segments of your audience. Only people who opted in receive them." />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {perms.manage ? (
        <Card title="New broadcast">
          <form action={saveCampaign} className="grid gap-4 sm:grid-cols-2"><Slug slug={creator.slug} />
            <Field label="Audience"><select name="segment" className="input"><option value="all_members">All active members</option><option value="tiers">Selected tiers</option><option value="trialing">Members on trial</option><option value="past_due">Members with failed payments</option><option value="churned">Former members</option><option value="waitlist">Waitlist</option></select></Field>
            <Field label="Channel"><select name="channel" className="input"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="both">Email + WhatsApp</option></select></Field>
            <div className="sm:col-span-2"><TierPicker tiers={tiers || []} hint="Only used when audience is 'Selected tiers'" /></div>
            <Field label="Subject" className="sm:col-span-2"><input name="subject" className="input" required /></Field>
            <Field label="Message" className="sm:col-span-2" hint="Use {{name}} for the member's name. WhatsApp uses your approved template."><textarea name="body" className="input" rows={8} required /></Field>
            <Field label="Schedule (IST, optional)"><input name="scheduled_at" type="datetime-local" className="input" /></Field>
            <div className="self-end"><SubmitButton confirm="Send this broadcast?">Send / schedule</SubmitButton></div>
          </form>
        </Card>
      ) : <ReadOnlyNotice />}
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Subject</th><th>Audience</th><th>Channel</th><th>Status</th><th>Sent</th></tr></thead>
        <tbody>{(list || []).map((c: any) => <tr key={c.id}><td className="font-medium">{c.subject}</td><td>{c.segment?.type?.replace('_', ' ')}</td><td>{c.channel}</td><td><StatusBadge status={c.status} /></td><td>{c.sent_at ? `${c.sent_count} · ${fmtDate(c.sent_at, true)}` : c.scheduled_at ? fmtDate(c.scheduled_at, true) : '—'}</td></tr>)}</tbody></table></div>
    </div>
  );
}
