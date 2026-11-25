import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, Stat } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { emailWaitlist } from '@/actions/studio/content';
import { fmtDate } from '@/lib/utils';

export default async function Waitlist({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const { data } = await admin().from('waitlist').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false });
  const pending = (data || []).filter((w: any) => !w.notified_at).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Waitlist" subtitle={creator.status === 'waitlist' ? 'Your page is collecting sign-ups' : 'Pre-launch sign-ups'} actions={<a href={`/api/studio/export?slug=${creator.slug}&what=waitlist`} className="btn-outline btn-sm">Export CSV</a>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Sign-ups" value={data?.length || 0} /><Stat label="Not yet emailed" value={pending} /></div>
      {perms.manage && pending > 0 && (
        <Card title="Send launch email">
          <form action={emailWaitlist} className="space-y-3"><Slug slug={creator.slug} />
            <Field label="Subject"><input name="subject" className="input" defaultValue={`${creator.name} is now open!`} /></Field>
            <Field label="Message"><textarea name="body" className="input" rows={4} defaultValue={'The doors are officially open 🎉\n\nAs a waitlist member you get first access. Use code EARLYBIRD for launch pricing.'} /></Field>
            <SubmitButton confirm={`Email ${pending} people now?`}>Email {pending} people</SubmitButton>
          </form>
        </Card>
      )}
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Email</th><th>Name</th><th>Joined</th><th>Emailed</th></tr></thead>
        <tbody>{(data || []).map((w: any) => <tr key={w.id}><td>{w.email}</td><td>{w.name}</td><td>{fmtDate(w.created_at)}</td><td>{w.notified_at ? fmtDate(w.notified_at) : '—'}</td></tr>)}</tbody></table></div>
    </div>
  );
}
