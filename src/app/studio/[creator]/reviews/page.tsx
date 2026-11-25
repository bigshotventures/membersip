import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Empty, Notice, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { moderateReview } from '@/actions/studio/content';
import { fmtDate } from '@/lib/utils';

export default async function Reviews({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const { data } = await admin().from('reviews').select('*, user:profiles(full_name)').eq('creator_id', creator.id).order('created_at', { ascending: false });
  const avg = data?.length ? (data.reduce((a: number, r: any) => a + r.rating, 0) / data.length).toFixed(2) : '—';
  return (
    <div className="space-y-4">
      <PageHeader title="Reviews & ratings" subtitle={`Average ${avg} ★ from ${data?.length || 0} reviews`} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {!data?.length && <Empty title="No reviews yet" />}
      {(data || []).map((r: any) => (
        <div key={r.id} className={`card p-4 ${r.hidden ? 'opacity-60' : ''}`}>
          <div className="text-sm"><b>{r.user?.full_name}</b> · <span className="text-amber-500">{'★'.repeat(r.rating)}</span> · <span className="text-zinc-500">{r.target_type} · {fmtDate(r.created_at)}</span></div>
          {r.body && <p className="mt-1 text-sm">{r.body}</p>}
          {perms.moderate && (
            <form action={moderateReview} className="mt-3 flex flex-wrap items-center gap-2"><Slug slug={creator.slug} /><input type="hidden" name="id" value={r.id} />
              <input name="reply" className="input flex-1" defaultValue={r.reply || ''} placeholder="Public reply" />
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="hidden" defaultChecked={r.hidden} /> Hide</label>
              <SubmitButton className="btn-outline btn-sm">Save</SubmitButton></form>
          )}
        </div>
      ))}
    </div>
  );
}
