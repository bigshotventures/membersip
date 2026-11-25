import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { MarkdownArea, Slug, TierPicker, VisibilitySelect } from '@/components/studio/bits';
import { cancelLive, saveLive, startAsHost } from '@/actions/studio/courses';
import { fmtDate, inr, isoToIstLocal } from '@/lib/utils';

export default async function LiveStudio({ params, searchParams }: { params: { creator: string }; searchParams: { edit?: string; notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: lives }, { data: tiers }] = await Promise.all([
    db.from('live_sessions').select('*').eq('creator_id', creator.id).order('starts_at', { ascending: false }).limit(100),
    db.from('tiers').select('id, name').eq('creator_id', creator.id).order('position'),
  ]);
  const e: any = searchParams.edit === 'new' ? {} : (lives || []).find((l: any) => l.id === searchParams.edit);
  const slug = creator.slug;
  return (
    <div className="space-y-6">
      <PageHeader title="Live sessions" subtitle="Each session gets a Zoom meeting that members join inside the platform" actions={perms.manage && <Link href="?edit=new" className="btn-primary">Schedule session</Link>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {!perms.manage && <ReadOnlyNotice />}
      {e && perms.manage && (
        <Card title={e.id ? 'Edit session' : 'Schedule a live session'}>
          <form action={saveLive} className="grid gap-4 sm:grid-cols-2"><Slug slug={slug} />{e.id && <input type="hidden" name="id" value={e.id} />}
            <Field label="Title" className="sm:col-span-2"><input name="title" className="input" defaultValue={e.title} required /></Field>
            <Field label="Starts (IST)"><input name="starts_at" type="datetime-local" className="input" defaultValue={isoToIstLocal(e.starts_at)} required /></Field>
            <Field label="Duration (min)"><input name="duration_min" type="number" className="input" defaultValue={e.duration_min || 60} /></Field>
            <Field label="Who can join"><VisibilitySelect value={e.visibility} /></Field>
            <Field label="Ticket price (₹)" hint="For ticketed events open to non-members"><input name="ticket_price" className="input" defaultValue={e.ticket_price_paise ? e.ticket_price_paise / 100 : ''} /></Field>
            <div className="sm:col-span-2"><TierPicker tiers={tiers || []} selected={e.tier_ids || []} /></div>
            <Field label="Description" className="sm:col-span-2"><MarkdownArea name="description" defaultValue={e.description} rows={4} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish_recording" defaultChecked={e.publish_recording ?? true} /> Record & publish replay automatically</label>
            {!e.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked /> Notify members now (email + WhatsApp)</label>}
            <div className="sm:col-span-2"><SubmitButton>{e.id ? 'Save changes' : 'Schedule'}</SubmitButton></div>
          </form>
        </Card>
      )}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Session</th><th>When</th><th>Access</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(lives || []).map((l: any) => (
              <tr key={l.id}>
                <td className="font-medium">{l.title}{l.recording_video_id && <span className="badge-green ml-2">replay</span>}</td>
                <td className="text-sm">{fmtDate(l.starts_at, true)}</td>
                <td className="text-sm">{l.visibility === 'ppv' ? `🎟 ${inr(l.ticket_price_paise)}` : l.visibility}</td>
                <td><StatusBadge status={l.status} /></td>
                <td className="whitespace-nowrap text-right">
                  {perms.moderate && ['scheduled', 'live'].includes(l.status) && l.zoom_meeting_id && <form action={startAsHost} className="inline"><Slug slug={slug} /><input type="hidden" name="id" value={l.id} /><SubmitButton className="btn-primary btn-sm">Start as host</SubmitButton></form>}
                  <Link href={`/${slug}/live/${l.id}`} className="btn-ghost btn-sm" target="_blank">View</Link>
                  {perms.manage && l.status === 'scheduled' && <><Link href={`?edit=${l.id}`} className="btn-ghost btn-sm">Edit</Link>
                    <form action={cancelLive} className="inline"><Slug slug={slug} /><input type="hidden" name="id" value={l.id} /><SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Cancel and notify members?">Cancel</SubmitButton></form></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">"Start as host" opens Zoom with host controls (screen share, recording, admitting people). Sign in to the platform's Zoom account on that device.</p>
    </div>
  );
}
