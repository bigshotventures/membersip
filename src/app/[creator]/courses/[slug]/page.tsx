import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { Markdown } from '@/components/Markdown';
import { Flash } from '@/components/creator/Flash';
import { SubmitButton } from '@/components/client';
import { Avatar } from '@/components/ui';
import { leaveReview } from '@/actions/member';
import { fmtDate, inr } from '@/lib/utils';

export default async function CoursePage({ params, searchParams }: { params: { creator: string; slug: string }; searchParams: any }) {
  const { creator, profile, membership, perms } = await loadCreatorPage(params.creator);
  const db = admin();
  const { data: course } = await db.from('courses').select('*').eq('creator_id', creator.id).eq('slug', params.slug).maybeSingle();
  if (!course || (course.status !== 'published' && !perms.view)) notFound();
  const [{ data: modules }, { data: lessons }, { data: cohorts }, { data: reviews }, access, { data: progress }, { data: cert }] = await Promise.all([
    db.from('course_modules').select('*').eq('course_id', course.id).order('position'),
    db.from('lessons').select('*').eq('course_id', course.id).order('position'),
    db.from('cohorts').select('*').eq('course_id', course.id).gte('starts_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('starts_at'),
    db.from('reviews').select('*, user:profiles(full_name, avatar_url)').eq('target_type', 'course').eq('target_id', course.id).eq('hidden', false).order('created_at', { ascending: false }).limit(10),
    profile ? createClient().rpc('can_read_course', { cid: course.id }) : Promise.resolve({ data: false }),
    profile ? db.from('lesson_progress').select('lesson_id, completed_at').eq('user_id', profile.id).eq('course_id', course.id) : Promise.resolve({ data: [] }),
    profile ? db.from('certificates').select('id, serial').eq('user_id', profile.id).eq('course_id', course.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const hasAccess = !!access.data;
  const doneSet = new Set((progress || []).filter((p: any) => p.completed_at).map((p: any) => p.lesson_id));
  const next = (lessons || []).find((l: any) => !doneSet.has(l.id)) || lessons?.[0];
  const base = `/${creator.slug}`;
  const path = `${base}/courses/${course.slug}`;
  const pct = lessons?.length ? Math.round((doneSet.size / lessons.length) * 100) : 0;
  const tierIncluded = course.tier_ids?.length > 0;
  const avg = reviews?.length ? (reviews.reduce((a: number, r: any) => a + r.rating, 0) / reviews.length).toFixed(1) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Flash sp={searchParams} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {course.cover_url && <img src={course.cover_url} alt="" className="aspect-video w-full rounded-xl object-cover" />}
        <div>
          <h1 className="text-3xl font-bold">{course.title}</h1>
          {course.subtitle && <p className="mt-1 text-lg text-zinc-600">{course.subtitle}</p>}
          {avg && <p className="mt-1 text-sm text-zinc-500">★ {avg} ({reviews!.length} reviews)</p>}
        </div>
        <Markdown>{course.description}</Markdown>

        <section className="card divide-y">
          {(modules || []).map((m: any) => (
            <div key={m.id} className="p-4">
              <h3 className="font-semibold">{m.title}</h3>
              <ul className="mt-2 space-y-1">
                {(lessons || []).filter((l: any) => l.module_id === m.id).map((l: any) => (
                  <li key={l.id} className="flex items-center justify-between text-sm">
                    {hasAccess || l.is_preview ? (
                      <Link href={`${path}/learn/${l.id}`} className="flex items-center gap-2 hover:underline">
                        <span>{doneSet.has(l.id) ? '✅' : { video: '▶️', text: '📄', pdf: '📎', quiz: '❓', assignment: '📝' }[l.kind as string]}</span>{l.title}
                      </Link>
                    ) : <span className="flex items-center gap-2 text-zinc-500">🔒 {l.title}</span>}
                    <span className="text-xs text-zinc-400">{l.is_preview && !hasAccess ? 'Free preview' : l.drip_days ? `Day ${l.drip_days}` : l.duration_s ? `${Math.round(l.duration_s / 60)} min` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Reviews</h2>
          {(reviews || []).map((r: any) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center gap-2 text-sm"><Avatar src={r.user?.avatar_url} name={r.user?.full_name} size={24} /><b>{r.user?.full_name}</b><span className="text-amber-500">{'★'.repeat(r.rating)}</span></div>
              {r.body && <p className="mt-2 text-sm">{r.body}</p>}
            </div>
          ))}
          {hasAccess && profile && (
            <form action={leaveReview} className="card flex flex-wrap items-end gap-3 p-4">
              <input type="hidden" name="creator_id" value={creator.id} /><input type="hidden" name="target_type" value="course" />
              <input type="hidden" name="target_id" value={course.id} /><input type="hidden" name="path" value={path} />
              <select name="rating" className="input w-24" defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}</select>
              <input name="body" className="input flex-1" placeholder="What did you think of this course?" />
              <SubmitButton className="btn-dark">Review</SubmitButton>
            </form>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <div className="card sticky top-20 space-y-4 p-5">
          {hasAccess ? (
            <>
              <div><div className="h-2 rounded bg-zinc-100"><div className="h-2 rounded accent-bg" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-sm text-zinc-500">{doneSet.size}/{lessons?.length || 0} lessons · {pct}%</p></div>
              {next && <Link href={`${path}/learn/${next.id}`} className="btn-primary w-full">{doneSet.size ? 'Continue' : 'Start course'}</Link>}
              {cert && <a href={`/api/certificates/${cert.id}`} target="_blank" className="btn-outline w-full">🎓 Download certificate</a>}
            </>
          ) : course.is_cohort ? (
            <>
              <h3 className="font-semibold">Upcoming batches</h3>
              {(cohorts || []).filter((h: any) => !h.enroll_closes_at || new Date(h.enroll_closes_at) > new Date()).map((h: any) => (
                <div key={h.id} className="rounded-lg border p-3">
                  <div className="font-medium">{h.name}</div>
                  <div className="text-xs text-zinc-500">Starts {fmtDate(h.starts_at)}{h.capacity ? ` · ${h.capacity} seats` : ''}</div>
                  <Link href={`${base}/checkout?kind=cohort&item=${h.id}`} className="btn-primary btn-sm mt-2 w-full">Enrol · {inr(h.price_paise ?? course.price_paise ?? 0)}</Link>
                </div>
              ))}
              {!cohorts?.length && <p className="text-sm text-zinc-500">No open batches right now.</p>}
            </>
          ) : (
            <>
              {course.price_paise !== null && <div className="text-3xl font-bold">{inr(course.price_paise)}</div>}
              {course.price_paise !== null && <Link href={`${base}/checkout?kind=course&item=${course.id}`} className="btn-primary w-full">Buy course</Link>}
              {tierIncluded && <Link href={`${base}#join`} className="btn-outline w-full">{membership?.hasAccess ? 'Upgrade tier to include this' : 'Included with membership — join'}</Link>}
              {!profile && <p className="text-center text-xs text-zinc-500">Already bought it? <Link href={`/login?next=${path}`} className="underline">Sign in</Link></p>}
            </>
          )}
          <ul className="space-y-1 text-sm text-zinc-600">
            <li>📚 {lessons?.length || 0} lessons</li>
            {course.certificate_enabled && <li>🎓 Certificate of completion</li>}
            <li>♾️ Lifetime access to purchased courses</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
