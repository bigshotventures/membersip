import Link from 'next/link';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { Empty } from '@/components/ui';
import { fmtDate } from '@/lib/utils';

export const metadata = { title: 'Challenges' };

export default async function Challenges({ params }: { params: { creator: string } }) {
  const { creator } = await loadCreatorPage(params.creator);
  const { data } = await admin().from('challenges').select('*, challenge_participants(count)').eq('creator_id', creator.id).order('starts_at', { ascending: false });
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Challenges</h1>
      {!data?.length ? <Empty title="No challenges yet" /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((c: any) => {
            const end = +new Date(c.starts_at) + c.days * 86400000;
            const state = Date.now() < +new Date(c.starts_at) ? 'Starts soon' : Date.now() < end ? 'Running' : 'Finished';
            return (
              <Link key={c.id} href={`/${creator.slug}/challenges/${c.id}`} className="card p-5 hover:shadow-md">
                <div className="flex justify-between"><span className="badge-amber">🔥 {c.days} days</span><span className="text-xs text-zinc-500">{state}</span></div>
                <h3 className="mt-2 text-lg font-semibold">{c.title}</h3>
                <p className="text-sm text-zinc-500">Starts {fmtDate(c.starts_at)} · {c.challenge_participants?.[0]?.count || 0} joined</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
