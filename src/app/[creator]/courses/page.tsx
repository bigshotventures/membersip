import Link from 'next/link';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { accessCtx, canSeeCourse } from '@/lib/access';
import { Empty } from '@/components/ui';
import { inr } from '@/lib/utils';

export const metadata = { title: 'Courses' };

export default async function Courses({ params }: { params: { creator: string } }) {
  const { creator, profile, membership, perms } = await loadCreatorPage(params.creator);
  const db = admin();
  const { data: courses } = await db.from('courses').select('*, lessons(count)').eq('creator_id', creator.id).eq('status', 'published').order('position');
  const ctx = await accessCtx(profile?.id, creator.id, membership, perms.view);
  const { data: enr } = profile ? await db.from('enrollments').select('course_id, completed_at').eq('user_id', profile.id) : { data: [] };
  const { data: prog } = profile ? await db.from('lesson_progress').select('course_id').eq('user_id', profile.id).not('completed_at', 'is', null) : { data: [] };
  const done = (id: string) => (prog || []).filter((p: any) => p.course_id === id).length;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Courses</h1>
      {!courses?.length ? <Empty title="No courses yet" /> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c: any) => {
            const total = c.lessons?.[0]?.count || 0;
            const access = canSeeCourse(c, ctx) || (enr || []).some((e: any) => e.course_id === c.id);
            const pct = total ? Math.round((done(c.id) / total) * 100) : 0;
            return (
              <Link key={c.id} href={`/${creator.slug}/courses/${c.slug}`} className="card overflow-hidden hover:shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.cover_url ? <img src={c.cover_url} alt="" className="aspect-video w-full object-cover" /> : <div className="aspect-video accent-bg opacity-70" />}
                <div className="p-4">
                  <div className="mb-1 flex gap-2">{c.is_cohort && <span className="badge-amber">Cohort</span>}<span className="badge">{total} lessons</span></div>
                  <h3 className="font-semibold">{c.title}</h3>
                  {c.subtitle && <p className="text-sm text-zinc-500">{c.subtitle}</p>}
                  <div className="mt-3 text-sm">
                    {access ? (
                      <div><div className="h-1.5 rounded bg-zinc-100"><div className="h-1.5 rounded accent-bg" style={{ width: `${pct}%` }} /></div><span className="text-xs text-zinc-500">{pct}% complete</span></div>
                    ) : c.price_paise ? <b>{inr(c.price_paise)}</b> : <span className="text-zinc-500">Included with membership</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
