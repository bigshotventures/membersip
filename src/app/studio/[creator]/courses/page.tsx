import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Empty, Field, Notice, PageHeader, ReadOnlyNotice, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { saveCourse } from '@/actions/studio/courses';
import { inr } from '@/lib/utils';

export default async function CoursesStudio({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const { data } = await admin().from('courses').select('*, lessons(count), enrollments(count)').eq('creator_id', creator.id).order('position');
  return (
    <div className="space-y-6">
      <PageHeader title="Courses & cohorts" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {!perms.manage && <ReadOnlyNotice />}
      {!data?.length ? <Empty title="No courses yet" /> : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((c: any) => (
            <Link key={c.id} href={`/studio/${creator.slug}/courses/${c.id}`} className="card p-5 hover:shadow-md">
              <div className="flex justify-between"><StatusBadge status={c.status} />{c.is_cohort && <span className="badge-amber">Cohort</span>}</div>
              <h3 className="mt-2 font-semibold">{c.title}</h3>
              <p className="text-sm text-zinc-500">{c.lessons?.[0]?.count || 0} lessons · {c.enrollments?.[0]?.count || 0} students · {c.price_paise !== null ? inr(c.price_paise) : 'Tier-included'}</p>
            </Link>
          ))}
        </div>
      )}
      {perms.manage && (
        <Card title="New course">
          <form action={saveCourse} className="grid gap-4 sm:grid-cols-2"><Slug slug={creator.slug} />
            <Field label="Title"><input name="title" className="input" required /></Field>
            <Field label="Price (₹)" hint="Leave empty if only included in tiers"><input name="price" className="input" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_cohort" /> Cohort-based (batches with start dates)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="certificate_enabled" defaultChecked /> Certificate on completion</label>
            <div className="sm:col-span-2"><SubmitButton>Create & build curriculum</SubmitButton></div>
          </form>
        </Card>
      )}
    </div>
  );
}
