import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { deleteAutomation, saveAutomation, toggleAutomation } from '@/actions/studio/community';
import { EVENT_LABELS } from '@/lib/events';
import { timeAgo } from '@/lib/utils';

const ACTION_LABEL: Record<string, string> = { send_email: 'Send email', send_whatsapp: 'Send WhatsApp', send_dm: 'Send a DM from the creator', notify: 'In-app notification', grant_course: 'Unlock a course', award_badge: 'Award a badge', grant_points: 'Give points', whatsapp_group_invite: 'Send WhatsApp group invite', webhook: 'Call a webhook' };

export default async function Automations({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: autos }, { data: tiers }, { data: courses }, { data: badges }, { data: runs }] = await Promise.all([
    db.from('automations').select('*').eq('creator_id', creator.id).order('created_at'),
    db.from('tiers').select('id, name').eq('creator_id', creator.id),
    db.from('courses').select('id, title').eq('creator_id', creator.id),
    db.from('badges').select('id, name, icon').eq('creator_id', creator.id),
    db.from('automation_runs').select('*, automation:automations!inner(name, creator_id)').eq('automation.creator_id', creator.id).order('created_at', { ascending: false }).limit(20),
  ]);
  const slug = creator.slug;
  return (
    <div className="space-y-6">
      <PageHeader title="Automations" subtitle="When something happens → do these things. Example: someone joins Pro → welcome DM + unlock bonus course + WhatsApp group invite." />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <div className="space-y-3">
        {(autos || []).map((a: any) => (
          <div key={a.id} className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${a.active ? '' : 'opacity-50'}`}>
            <div><b>{a.name}</b><div className="text-sm text-zinc-500">⚡ {EVENT_LABELS[a.trigger as keyof typeof EVENT_LABELS] || a.trigger}{a.conditions?.tier_id ? ` (${tiers?.find((t: any) => t.id === a.conditions.tier_id)?.name})` : ''} → {a.actions.map((x: any) => ACTION_LABEL[x.type]).join(' + ')} · ran {a.run_count}×</div></div>
            {perms.manage && <div className="flex gap-2">
              <form action={toggleAutomation}><Slug slug={slug} /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="active" value={a.active ? '' : 'on'} /><SubmitButton className="btn-outline btn-sm">{a.active ? 'Pause' : 'Resume'}</SubmitButton></form>
              <form action={deleteAutomation}><Slug slug={slug} /><input type="hidden" name="id" value={a.id} /><SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Delete automation?">Delete</SubmitButton></form>
            </div>}
          </div>
        ))}
      </div>
      {perms.manage ? (
        <Card title="New automation">
          <form action={saveAutomation} className="space-y-4"><Slug slug={slug} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name"><input name="name" className="input" required placeholder="Pro welcome" /></Field>
              <Field label="When"><select name="trigger" className="input">{Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Only for tier (optional)"><select name="cond_tier_id" className="input"><option value="">Any tier</option>{(tiers || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">Then do</p>
              <Act k="send_email"><input name="email_subject" className="input" placeholder="Subject — e.g. Welcome {{name}}!" /><textarea name="email_body" className="input" rows={3} placeholder="Message" /></Act>
              <Act k="send_whatsapp"><input name="wa_message" className="input" placeholder="WhatsApp message" /></Act>
              <Act k="send_dm"><textarea name="dm_body" className="input" rows={2} placeholder="DM from the creator" /></Act>
              <Act k="notify"><input name="notify_title" className="input" placeholder="Title" /><input name="notify_body" className="input" placeholder="Body" /></Act>
              <Act k="grant_course"><select name="course_id" className="input">{(courses || []).map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Act>
              <Act k="award_badge"><select name="badge_id" className="input">{(badges || []).map((b: any) => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}</select></Act>
              <Act k="grant_points"><input name="points" type="number" className="input" defaultValue={50} /></Act>
              <Act k="whatsapp_group_invite"><p className="text-xs text-zinc-500">Uses the tier's WhatsApp group link (or the default one in Page settings).</p></Act>
              <Act k="webhook"><input name="webhook_url" className="input" placeholder="https://hooks.zapier.com/…" /></Act>
            </div>
            <SubmitButton>Create automation</SubmitButton>
          </form>
        </Card>
      ) : <ReadOnlyNotice />}
      <Card title="Recent runs">
        {(runs || []).map((r: any) => <div key={r.id} className="flex justify-between border-b py-1 text-sm last:border-0"><span>{r.automation.name} · <span className={r.status === 'ok' ? 'text-emerald-700' : 'text-red-600'}>{r.status}</span></span><span className="text-zinc-500">{timeAgo(r.created_at)}</span></div>)}
        {!runs?.length && <p className="text-sm text-zinc-500">No runs yet</p>}
      </Card>
    </div>
  );
}

function Act({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <details className="rounded border p-3">
      <summary className="cursor-pointer text-sm"><label className="inline-flex items-center gap-2"><input type="checkbox" name="actions" value={k} /> {ACTION_LABEL[k]}</label></summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}
