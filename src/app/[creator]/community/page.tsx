import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { Empty } from '@/components/ui';

export const metadata = { title: 'Community' };

export default async function Community({ params }: { params: { creator: string } }) {
  const { creator, membership, perms, profile } = await loadCreatorPage(params.creator);
  const db = admin();
  const { data: spaces } = await db.from('spaces').select('*').eq('creator_id', creator.id).order('position');
  const { data: enr } = profile ? await db.from('enrollments').select('cohort_id').eq('user_id', profile.id).not('cohort_id', 'is', null) : { data: [] };
  const myCohorts = new Set((enr || []).map((e: any) => e.cohort_id));
  const tierId = membership?.hasAccess ? membership.tier_id : null;
  const can = (s: any) => perms.view || (s.cohort_id ? myCohorts.has(s.cohort_id) : !!tierId && (!s.tier_ids.length || s.tier_ids.includes(tierId)));
  const visible = (spaces || []).filter((s: any) => !s.cohort_id || can(s));
  if (visible.length === 1 && can(visible[0])) redirect(`/${creator.slug}/community/${visible[0].id}`);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Community</h1>
      {!visible.length ? <Empty title="The community opens soon" /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((s: any) => (
            <Link key={s.id} href={can(s) ? `/${creator.slug}/community/${s.id}` : `/${creator.slug}#join`} className="card p-5 hover:shadow-md">
              <div className="flex items-center justify-between"><h3 className="font-semibold">{s.kind === 'chat' ? '💬' : '#'} {s.name}</h3>{!can(s) && <span className="badge">🔒</span>}</div>
              {s.description && <p className="mt-1 text-sm text-zinc-500">{s.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
