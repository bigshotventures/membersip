import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { deleteSequence, saveSequence } from '@/actions/studio/community';

const TRIGGERS: Record<string, string> = { member_joined: 'When someone joins', waitlist_joined: 'When someone joins the waitlist', member_cancelled: 'When someone cancels', course_enrolled: 'When someone enrols in a course', purchase: 'After a one-off purchase' };

export default async function Sequences({ params, searchParams }: { params: { creator: string }; searchParams: { edit?: string; notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const { data: seqs } = await db.from('sequences').select('*, sequence_steps(*), sequence_runs(count)').eq('creator_id', creator.id).order('created_at');
  const s: any = searchParams.edit === 'new' ? { trigger: 'member_joined', active: true, sequence_steps: [] } : (seqs || []).find((x: any) => x.id === searchParams.edit);
  const steps = s ? [...(s.sequence_steps || [])].sort((a: any, b: any) => a.position - b.position) : [];
  const slug = creator.slug;
  return (
    <div className="space-y-6">
      <PageHeader title="Sequences" subtitle="Drip emails and WhatsApp messages that send themselves — onboarding, nurture, win-back" actions={perms.manage && <Link href="?edit=new" className="btn-primary">New sequence</Link>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {!perms.manage && <ReadOnlyNotice />}
      {s && perms.manage && (
        <Card title={s.id ? `Edit: ${s.name}` : 'New sequence'}>
          <form action={saveSequence} className="space-y-4"><Slug slug={slug} />{s.id && <input type="hidden" name="id" value={s.id} />}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name"><input name="name" className="input" defaultValue={s.name || 'Welcome series'} required /></Field>
              <Field label="Starts"><select name="trigger" className="input" defaultValue={s.trigger}>{Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} /> Active</label>
            </div>
            {Array.from({ length: Math.max(3, steps.length + 1) }, (_, i) => steps[i] || {}).map((st: any, i: number) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4">
                <div className="text-sm font-semibold sm:col-span-4">Step {i + 1}</div>
                <Field label={i === 0 ? 'Hours after trigger' : 'Hours after previous'}><input name={`step_${i}_delay`} type="number" className="input" defaultValue={st.delay_hours ?? (i === 0 ? 0 : 48)} /></Field>
                <Field label="Channel"><select name={`step_${i}_channel`} className="input" defaultValue={st.channel || 'email'}><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></Field>
                <Field label="Subject" className="sm:col-span-2"><input name={`step_${i}_subject`} className="input" defaultValue={st.subject || ''} /></Field>
                <Field label="Message ({{name}} works)" className="sm:col-span-4"><textarea name={`step_${i}_body`} className="input" rows={3} defaultValue={st.body || ''} /></Field>
              </div>
            ))}
            <div className="flex gap-2"><SubmitButton>Save sequence</SubmitButton>{s.id && <button formAction={deleteSequence} name="id" value={s.id} className="btn-ghost text-red-600">Delete</button>}</div>
          </form>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {(seqs || []).map((x: any) => (
          <div key={x.id} className={`card p-4 ${x.active ? '' : 'opacity-50'}`}>
            <div className="flex justify-between"><b>{x.name}</b>{perms.manage && <Link href={`?edit=${x.id}`} className="text-sm underline">Edit</Link>}</div>
            <p className="text-sm text-zinc-500">{TRIGGERS[x.trigger]} · {x.sequence_steps?.length || 0} steps · {x.sequence_runs?.[0]?.count || 0} people enrolled</p>
          </div>
        ))}
      </div>
    </div>
  );
}
