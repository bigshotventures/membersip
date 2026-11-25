import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, Tabs, StatusBadge } from '@/components/ui';
import { FileUpload, SubmitButton } from '@/components/client';
import { MarkdownArea, Slug, TierPicker, VideoSelect } from '@/components/studio/bits';
import { deleteCourse, deleteLesson, deleteModule, gradeSubmission, saveCohort, saveCourse, saveLesson, saveModule } from '@/actions/studio/courses';
import { fmtDate, inr, isoToIstLocal } from '@/lib/utils';

export default async function CourseEditor({ params, searchParams }: { params: { creator: string; id: string }; searchParams: { tab?: string; lesson?: string; module?: string; notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const { data: course } = await db.from('courses').select('*').eq('id', params.id).eq('creator_id', creator.id).maybeSingle();
  if (!course) notFound();
  const tab = searchParams.tab || 'curriculum';
  const base = `/studio/${creator.slug}/courses/${course.id}`;
  const [{ data: modules }, { data: lessons }, { data: tiers }, { data: videos }] = await Promise.all([
    db.from('course_modules').select('*').eq('course_id', course.id).order('position'),
    db.from('lessons').select('*').eq('course_id', course.id).order('position'),
    db.from('tiers').select('id, name').eq('creator_id', creator.id).order('position'),
    db.from('videos').select('id, title, status').eq('creator_id', creator.id).order('created_at', { ascending: false }),
  ]);
  const slug = creator.slug;
  const H = () => <><Slug slug={slug} /><input type="hidden" name="course_id" value={course.id} /></>;

  let lessonEdit: any = null, content: any = null, quiz: any[] = [], assignment: any = null;
  if (searchParams.lesson) {
    lessonEdit = searchParams.lesson === 'new' ? { module_id: searchParams.module, kind: 'video' } : (lessons || []).find((l: any) => l.id === searchParams.lesson);
    if (lessonEdit?.id) {
      [{ data: content }, { data: quiz }, { data: assignment }] = await Promise.all([
        db.from('lesson_contents').select('*').eq('lesson_id', lessonEdit.id).maybeSingle(),
        db.from('quiz_questions').select('*').eq('lesson_id', lessonEdit.id).order('position'),
        db.from('assignments').select('*').eq('lesson_id', lessonEdit.id).maybeSingle(),
      ]) as any;
    }
  }
  const quizText = (quiz || []).map((q: any) => [q.question, ...q.options.map((o: string, i: number) => (i === q.correct_index ? `* ${o}` : `- ${o}`))].join('\n')).join('\n\n');

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title={course.title} subtitle={<><StatusBadge status={course.status} /> <Link href={`/${slug}/courses/${course.slug}`} target="_blank" className="ml-2 underline">Preview ↗</Link></>} actions={<Link href={`/studio/${slug}/courses`} className="btn-ghost btn-sm">← Courses</Link>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <Tabs active={`${base}?tab=${tab}`} items={[{ href: `${base}?tab=curriculum`, label: 'Curriculum' }, { href: `${base}?tab=details`, label: 'Details & pricing' }, ...(course.is_cohort ? [{ href: `${base}?tab=cohorts`, label: 'Batches' }] : []), { href: `${base}?tab=students`, label: 'Students' }, { href: `${base}?tab=submissions`, label: 'Submissions' }]} />

      {tab === 'details' && (
        <form action={saveCourse} className="space-y-4"><Slug slug={slug} /><input type="hidden" name="id" value={course.id} />
          <fieldset disabled={!perms.manage}>
            <Card><div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title"><input name="title" className="input" defaultValue={course.title} required /></Field>
              <Field label="URL slug"><input name="course_slug" className="input" defaultValue={course.slug} /></Field>
              <Field label="Subtitle" className="sm:col-span-2"><input name="subtitle" className="input" defaultValue={course.subtitle || ''} /></Field>
              <Field label="Description" className="sm:col-span-2"><MarkdownArea name="description" defaultValue={course.description} /></Field>
              <Field label="Cover image"><FileUpload name="cover_url" scope="studio" creatorId={creator.id} accept="image/*" defaultValue={course.cover_url} /></Field>
              <Field label="Price (₹)" hint="Empty = not sold separately"><input name="price" className="input" defaultValue={course.price_paise !== null ? course.price_paise / 100 : ''} /></Field>
              <div className="sm:col-span-2"><TierPicker tiers={tiers || []} selected={course.tier_ids} label="Included free in tiers" hint="Members of ticked tiers get this course" /></div>
              <Field label="Status"><select name="status" className="input" defaultValue={course.status}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>
              <Field label="Order"><input name="position" type="number" className="input" defaultValue={course.position} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_cohort" defaultChecked={course.is_cohort} /> Cohort-based</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="certificate_enabled" defaultChecked={course.certificate_enabled} /> Certificate</label>
            </div></Card>
            {perms.manage && <div className="mt-4"><SubmitButton>Save</SubmitButton></div>}
          </fieldset>
          {perms.manage && <button formAction={deleteCourse} name="id" value={course.id} className="btn-ghost text-red-600" formNoValidate>Delete course</button>}
        </form>
      )}

      {tab === 'curriculum' && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-2">
            {(modules || []).map((m: any) => (
              <Card key={m.id}>
                {perms.manage ? (
                  <form action={saveModule} className="mb-2 flex gap-2"><H /><input type="hidden" name="id" value={m.id} />
                    <input name="title" className="input py-1 font-semibold" defaultValue={m.title} /><input name="position" type="number" className="input w-16 py-1" defaultValue={m.position} />
                    <SubmitButton className="btn-ghost btn-sm">✓</SubmitButton>
                    <button formAction={deleteModule} className="btn-ghost btn-sm text-red-600" title="Delete module">✕</button></form>
                ) : <h3 className="mb-2 font-semibold">{m.title}</h3>}
                <ul className="space-y-1">
                  {(lessons || []).filter((l: any) => l.module_id === m.id).map((l: any) => (
                    <li key={l.id}><Link href={`${base}?lesson=${l.id}`} className={`block rounded px-2 py-1 text-sm hover:bg-zinc-50 ${searchParams.lesson === l.id ? 'bg-zinc-100 font-medium' : ''}`}>{l.position}. {l.title} <span className="text-xs text-zinc-400">{l.kind}{l.is_preview ? ' · preview' : ''}{l.drip_days ? ` · day ${l.drip_days}` : ''}</span></Link></li>
                  ))}
                </ul>
                {perms.manage && <Link href={`${base}?lesson=new&module=${m.id}`} className="mt-2 block text-sm underline">+ Add lesson</Link>}
              </Card>
            ))}
            {perms.manage && <form action={saveModule} className="flex gap-2"><H /><input name="title" className="input" placeholder="New module title" required /><SubmitButton className="btn-outline">Add module</SubmitButton></form>}
          </div>
          <div className="lg:col-span-3">
            {lessonEdit && perms.manage ? (
              <Card title={lessonEdit.id ? 'Edit lesson' : 'New lesson'}>
                <form action={saveLesson} className="space-y-4"><H />{lessonEdit.id && <input type="hidden" name="id" value={lessonEdit.id} />}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Title" className="sm:col-span-2"><input name="title" className="input" defaultValue={lessonEdit.title} required /></Field>
                    <Field label="Module"><select name="module_id" className="input" defaultValue={lessonEdit.module_id}>{(modules || []).map((m: any) => <option key={m.id} value={m.id}>{m.title}</option>)}</select></Field>
                    <Field label="Type"><select name="kind" className="input" defaultValue={lessonEdit.kind}>{['video', 'text', 'pdf', 'quiz', 'assignment'].map((k) => <option key={k}>{k}</option>)}</select></Field>
                    <Field label="Order"><input name="position" type="number" className="input" defaultValue={lessonEdit.position ?? (lessons?.length || 0) + 1} /></Field>
                    <Field label="Length (min)"><input name="duration_min" type="number" className="input" defaultValue={lessonEdit.duration_s ? Math.round(lessonEdit.duration_s / 60) : ''} /></Field>
                    <Field label="Drip: unlock after (days)" hint="From enrolment, or from batch start for cohorts"><input name="drip_days" type="number" className="input" defaultValue={lessonEdit.drip_days || 0} /></Field>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="is_preview" defaultChecked={lessonEdit.is_preview} /> Free preview</label>
                  </div>
                  <Field label="Video"><VideoSelect videos={videos || []} value={content?.video_id} /></Field>
                  <Field label="Lesson text"><MarkdownArea name="body" defaultValue={content?.body} rows={8} /></Field>
                  <Field label="Downloadable file"><FileUpload name="file_path" scope="studio" creatorId={creator.id} bucket="private" defaultValue={content?.file_path} /></Field>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="stamp_pdf" defaultChecked={content?.stamp_pdf ?? true} /> Stamp PDFs with the student's name</label>
                  <Field label="Quiz (for quiz lessons)" hint="Question on the first line, then options starting with '-'. Mark the correct option with '*'. Blank line between questions."><textarea name="quiz" className="input font-mono text-sm" rows={8} defaultValue={quizText} placeholder={'What is 2+2?\n- 3\n* 4\n- 5'} /></Field>
                  <details open={lessonEdit.kind === 'assignment'}><summary className="cursor-pointer text-sm font-medium">Assignment settings</summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Instructions" className="sm:col-span-2"><textarea name="instructions" className="input" rows={4} defaultValue={assignment?.instructions || ''} /></Field>
                      <Field label="Due (IST)"><input name="due_at" type="datetime-local" className="input" defaultValue={isoToIstLocal(assignment?.due_at)} /></Field>
                      <Field label="Max score"><input name="max_score" type="number" className="input" defaultValue={assignment?.max_score || 10} /></Field>
                    </div>
                  </details>
                  <div className="flex gap-2"><SubmitButton>Save lesson</SubmitButton>{lessonEdit.id && <button formAction={deleteLesson} name="id" value={lessonEdit.id} className="btn-ghost text-red-600">Delete</button>}</div>
                </form>
              </Card>
            ) : <p className="text-sm text-zinc-500">Select a lesson to edit, or add one to a module.</p>}
          </div>
        </div>
      )}

      {tab === 'cohorts' && <Cohorts course={course} slug={slug} canManage={perms.manage} H={H} />}
      {tab === 'students' && <Students courseId={course.id} total={lessons?.length || 0} />}
      {tab === 'submissions' && <Submissions courseId={course.id} slug={slug} canGrade={perms.moderate} />}
    </div>
  );
}

async function Cohorts({ course, slug, canManage, H }: any) {
  const { data } = await admin().from('cohorts').select('*, enrollments(count)').eq('course_id', course.id).order('starts_at', { ascending: false });
  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Batch</th><th>Starts</th><th>Seats</th><th>Price</th><th>Enrolled</th></tr></thead>
        <tbody>{(data || []).map((h: any) => <tr key={h.id}><td>{h.name}</td><td>{fmtDate(h.starts_at, true)}</td><td>{h.capacity || '∞'}</td><td>{inr(h.price_paise ?? course.price_paise ?? 0)}</td><td>{h.enrollments?.[0]?.count || 0}</td></tr>)}</tbody></table></div>
      {canManage && (
        <Card title="New batch">
          <form action={saveCohort} className="grid gap-3 sm:grid-cols-3"><H />
            <Field label="Name"><input name="name" className="input" placeholder="Batch 3 — January" required /></Field>
            <Field label="Starts (IST)"><input name="starts_at" type="datetime-local" className="input" required /></Field>
            <Field label="Ends (IST)"><input name="ends_at" type="datetime-local" className="input" /></Field>
            <Field label="Enrolment closes"><input name="enroll_closes_at" type="datetime-local" className="input" /></Field>
            <Field label="Seats"><input name="capacity" type="number" className="input" /></Field>
            <Field label="Price (₹)" hint="Empty = course price"><input name="price" className="input" /></Field>
            <div className="sm:col-span-3"><SubmitButton>Create batch</SubmitButton></div>
          </form>
        </Card>
      )}
    </div>
  );
}

async function Students({ courseId, total }: { courseId: string; total: number }) {
  const db = admin();
  const { data } = await db.from('enrollments').select('*, user:profiles(full_name, email), cohort:cohorts(name)').eq('course_id', courseId).order('enrolled_at', { ascending: false }).limit(500);
  const { data: prog } = await db.from('lesson_progress').select('user_id').eq('course_id', courseId).not('completed_at', 'is', null);
  const count = (u: string) => (prog || []).filter((p: any) => p.user_id === u).length;
  return (
    <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Student</th><th>Batch</th><th>Enrolled</th><th>Progress</th></tr></thead>
      <tbody>{(data || []).map((e: any) => <tr key={e.id}><td>{e.user?.full_name}<div className="text-xs text-zinc-500">{e.user?.email}</div></td><td>{e.cohort?.name || '—'}</td><td>{fmtDate(e.enrolled_at)}</td>
        <td>{count(e.user_id)}/{total} {e.completed_at && '🎓'}</td></tr>)}</tbody></table></div>
  );
}

async function Submissions({ courseId, slug, canGrade }: { courseId: string; slug: string; canGrade: boolean }) {
  const { data } = await admin().from('submissions').select('*, user:profiles!submissions_user_id_fkey(full_name), assignment:assignments!inner(max_score, lesson:lessons!inner(title, course_id))').eq('assignment.lesson.course_id', courseId).order('submitted_at', { ascending: false });
  return (
    <div className="space-y-3">
      {!data?.length && <p className="text-sm text-zinc-500">No submissions yet.</p>}
      {(data || []).map((s: any) => (
        <Card key={s.id}>
          <div className="text-sm"><b>{s.user?.full_name}</b> · {s.assignment.lesson.title} · {fmtDate(s.submitted_at, true)} {s.score !== null && <span className="badge-green">{s.score}/{s.assignment.max_score}</span>}</div>
          {s.body && <p className="mt-2 whitespace-pre-wrap text-sm">{s.body}</p>}
          {s.file_path && <a className="text-sm underline" href={`/api/files?type=submission&id=${s.id}`}>📎 Attachment</a>}
          {canGrade && (
            <form action={gradeSubmission} className="mt-3 flex flex-wrap gap-2"><Slug slug={slug} /><input type="hidden" name="id" value={s.id} /><input type="hidden" name="course_id" value={courseId} />
              <input name="score" type="number" className="input w-24" defaultValue={s.score ?? ''} placeholder="Score" required />
              <input name="feedback" className="input flex-1" defaultValue={s.feedback || ''} placeholder="Feedback" />
              <SubmitButton className="btn-outline">Grade</SubmitButton></form>
          )}
        </Card>
      ))}
    </div>
  );
}
