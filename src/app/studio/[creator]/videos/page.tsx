import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Empty, PageHeader, ReadOnlyNotice, StatusBadge, Notice } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { VideoUploader } from '@/components/studio/VideoUploader';
import { VideoPlayer } from '@/components/VideoPlayer';
import { deleteVideo, renameVideo } from '@/actions/studio/content';
import { fmtDate } from '@/lib/utils';

export default async function Videos({ params, searchParams }: { params: { creator: string }; searchParams: { play?: string; notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const { data: videos } = await admin().from('videos').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false });
  return (
    <div className="space-y-6">
      <PageHeader title="Video library" subtitle="Use videos in posts, lessons, intro and preview clips" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {perms.manage ? <VideoUploader creatorId={creator.id} /> : <ReadOnlyNotice />}
      {searchParams.play && <VideoPlayer videoId={searchParams.play} context={{ type: 'studio' }} />}
      {!videos?.length ? <Empty title="No videos yet" /> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Title</th><th>Status</th><th>Length</th><th>Added</th><th /></tr></thead>
            <tbody>
              {videos.map((v: any) => (
                <tr key={v.id}>
                  <td>
                    {perms.manage ? (
                      <form action={renameVideo} className="flex items-center gap-2"><Slug slug={creator.slug} /><input type="hidden" name="id" value={v.id} />
                        <input name="title" defaultValue={v.title} className="input py-1" />
                        <label className="flex items-center gap-1 whitespace-nowrap text-xs"><input type="checkbox" name="is_public" defaultChecked={v.is_public} /> public</label>
                        <SubmitButton className="btn-ghost btn-sm">Save</SubmitButton></form>
                    ) : v.title}
                  </td>
                  <td><StatusBadge status={v.status} /></td>
                  <td className="text-sm">{v.duration_s ? `${Math.floor(v.duration_s / 60)}:${String(Math.round(v.duration_s % 60)).padStart(2, '0')}` : '—'}</td>
                  <td className="text-sm text-zinc-500">{fmtDate(v.created_at)}</td>
                  <td className="whitespace-nowrap text-right">
                    {v.status === 'ready' && <a href={`?play=${v.id}`} className="btn-ghost btn-sm">Play</a>}
                    {perms.manage && <form action={deleteVideo} className="inline"><Slug slug={creator.slug} /><input type="hidden" name="id" value={v.id} /><SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Delete this video everywhere it's used?">Delete</SubmitButton></form>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
