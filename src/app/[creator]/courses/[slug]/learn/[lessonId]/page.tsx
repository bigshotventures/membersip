import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { Markdown } from '@/components/Markdown';
import { VideoPlayer } from '@/components/VideoPlayer';
import { Comments } from '@/components/creator/Social';
import { Flash } from '@/components/creator/Flash';
import { FileUpload, SubmitButton } from '@/components/client';
import { completeLesson, submitAssignment, submitQuiz } from '@/actions/member';
import { cn, fmtDate } from '@/lib/utils';

export default async function LearnPage({ params, searchParams }: { params: { creator: string; slug: string; lessonId: string }; searchParams: any }) {
  const { creator, profile, perms } = await loadCreatorPage(params.creator);
  const db = admin(), sb = createClient();
  const { data: course } = await db.from('courses').select('*').eq('creator_id', creator.id).eq('slug', params.slug).maybeSingle();
  if (!course) notFound();
  const [{ data: modules }, { data: lessons }, { data: content }, { data: progress }] = await Promise.all([
    db.from('course_modules').select('*').eq('course_id', course.id).order('position'),
    db.from('lessons').select('*').eq('course_id', course.id).order('position'),
    sb.from('lesson_contents').select('*').eq('lesson_id', params.lessonId).maybeSingle(), // RLS: access + drip
    profile ? db.from('lesson_progress').select('lesson_id, completed_at').eq('user_id', profile.id).eq('course_id', course.id) : Promise.resolve({ data: [] }),
  ]);
  const ordered = (modules || []).flatMap((m: any) => (lessons || []).filter((l: any) => l.module_id === m.id));
  const idx = ordered.findIndex((l: any) => l.id === params.lessonId);
  const lesson = ordered[idx];
  if (!lesson) notFound();
  const next = ordered[idx + 1], prev = ordered[idx - 1];
  const done = new Set((progress || []).filter((p: any) => p.completed_at).map((p: any) => p.lesson_id));
  const base = `/${creator.slug}/courses/${course.slug}`;
  const path = `${base}/learn/${lesson.id}`;

  let unlockAt: string | null = null;
  if (!content && profile) {
    const { data: canCourse } = await sb.rpc('can_read_course', { cid: course.id });
    if (canCourse) unlockAt = (await sb.rpc('lesson_unlock_at', { lid: lesson.id })).data;
  }
  const [{ data: questions }, { data: assignment }, { data: lastAttempt }] = await Promise.all([
    content && lesson.kind === 'quiz' ? sb.from('quiz_questions').select('id, question, options, position').eq('lesson_id', lesson.id).order('position') : Promise.resolve({ data: [] }),
    content && lesson.kind === 'assignment' ? sb.from('assignments').select('*').eq('lesson_id', lesson.id).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    content && lesson.kind === 'quiz' && profile ? db.from('quiz_attempts').select('*').eq('lesson_id', lesson.id).eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { data: submission } = assignment && profile ? await db.from('submissions').select('*').eq('assignment_id', assignment.id).eq('user_id', profile.id).maybeSingle() : { data: null };

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <aside className="order-2 lg:order-1">
        <Link href={base} className="text-sm text-zinc-500 hover:underline">← {course.title}</Link>
        <nav className="card mt-3 max-h-[75vh] overflow-y-auto p-2">
          {(modules || []).map((m: any) => (
            <div key={m.id} className="mb-2">
              <div className="px-2 py-1 text-xs font-semibold uppercase text-zinc-500">{m.title}</div>
              {(lessons || []).filter((l: any) => l.module_id === m.id).map((l: any) => (
                <Link key={l.id} href={`${base}/learn/${l.id}`} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm', l.id === lesson.id ? 'bg-zinc-100 font-medium' : 'hover:bg-zinc-50')}>
                  <span className="w-4 text-xs">{done.has(l.id) ? '✅' : ''}</span>{l.title}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="order-1 space-y-5 lg:order-2 lg:col-span-3">
        <Flash sp={searchParams} />
        <h1 className="text-2xl font-bold">{lesson.title}</h1>
        {!content ? (
          <div className="card p-8 text-center">
            {unlockAt ? <p>⏳ This lesson unlocks on <b>{fmtDate(unlockAt, true)}</b>.</p>
              : <><p>🔒 This lesson is locked.</p><Link href={base} className="btn-primary mt-4">Get access</Link></>}
          </div>
        ) : (
          <>
            {content.video_id && <VideoPlayer videoId={content.video_id} context={{ type: 'lesson', id: lesson.id }} title={lesson.title} accent={creator.theme?.accent} />}
            <Markdown>{content.body}</Markdown>
            {content.file_path && <a href={`/api/files?type=lesson&id=${lesson.id}`} className="btn-outline">📎 Download {content.file_path.split('/').pop()}</a>}

            {lesson.kind === 'quiz' && !!questions?.length && (
              <form action={submitQuiz} className="card space-y-5 p-5">
                <input type="hidden" name="lesson_id" value={lesson.id} /><input type="hidden" name="path" value={path} /><input type="hidden" name="count" value={questions.length} />
                {lastAttempt && <p className="text-sm text-zinc-500">Last attempt: {lastAttempt.score}/{lastAttempt.total}</p>}
                {questions.map((q: any, i: number) => (
                  <fieldset key={q.id}>
                    <legend className="mb-2 font-medium">{i + 1}. {q.question}</legend>
                    {q.options.map((o: string, j: number) => (
                      <label key={j} className="flex items-center gap-2 py-1 text-sm"><input type="radio" name={`q${i}`} value={j} required /> {o}</label>
                    ))}
                  </fieldset>
                ))}
                <SubmitButton className="btn-primary">Submit answers</SubmitButton>
              </form>
            )}

            {lesson.kind === 'assignment' && assignment && profile && (
              <div className="card space-y-3 p-5">
                <h3 className="font-semibold">Assignment</h3>
                <Markdown>{assignment.instructions}</Markdown>
                {assignment.due_at && <p className="text-sm text-zinc-500">Due {fmtDate(assignment.due_at, true)}</p>}
                {submission?.score !== null && submission?.score !== undefined ? (
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm"><b>Score: {submission.score}/{assignment.max_score}</b>{submission.feedback && <p className="mt-1">{submission.feedback}</p>}</div>
                ) : (
                  <form action={submitAssignment} className="space-y-3">
                    <input type="hidden" name="assignment_id" value={assignment.id} /><input type="hidden" name="path" value={path} />
                    <textarea name="body" className="input" rows={5} defaultValue={submission?.body || ''} placeholder="Your answer or a link to your work" />
                    <FileUpload name="file_path" scope="submission" bucket="private" defaultValue={submission?.file_path} label="Attach file" />
                    <SubmitButton className="btn-primary">{submission ? 'Update submission' : 'Submit'}</SubmitButton>
                  </form>
                )}
              </div>
            )}

            {profile && lesson.kind !== 'quiz' && (
              <form action={completeLesson} className="flex flex-wrap gap-2">
                <input type="hidden" name="lesson_id" value={lesson.id} /><input type="hidden" name="path" value={path} />
                <input type="hidden" name="next" value={next ? `${base}/learn/${next.id}` : base} />
                <SubmitButton className="btn-primary">{done.has(lesson.id) ? (next ? 'Next lesson →' : 'Back to course') : next ? 'Mark complete & continue →' : 'Mark complete'}</SubmitButton>
              </form>
            )}
            <div className="flex justify-between text-sm">
              {prev ? <Link href={`${base}/learn/${prev.id}`} className="text-zinc-500 hover:underline">← {prev.title}</Link> : <span />}
              {next ? <Link href={`${base}/learn/${next.id}`} className="text-zinc-500 hover:underline">{next.title} →</Link> : <span />}
            </div>
            <Comments creatorId={creator.id} targetType="lesson" targetId={lesson.id} path={path} viewerId={profile?.id} canComment={!!profile} canModerate={perms.moderate} />
          </>
        )}
      </main>
    </div>
  );
}
