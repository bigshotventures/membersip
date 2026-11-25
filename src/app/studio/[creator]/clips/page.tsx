import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice, StatusBadge } from '@/components/ui';
import { CopyButton, SubmitButton } from '@/components/client';
import { Slug, VideoSelect } from '@/components/studio/bits';
import { saveClip } from '@/actions/studio/content';
import { APP_URL } from '@/lib/utils';

export default async function Clips({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: clips }, { data: videos }] = await Promise.all([
    db.from('preview_clips').select('*, clip:videos!preview_clips_clip_video_id_fkey(status, mux_playback_id)').eq('creator_id', creator.id).order('created_at', { ascending: false }),
    db.from('videos').select('id, title, status').eq('creator_id', creator.id).eq('is_public', false).order('created_at', { ascending: false }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Preview clips" subtitle="Cut a teaser from any members-only video and share it on Instagram, YouTube Shorts or WhatsApp. Every clip links back to your join page." />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {perms.manage ? (
        <Card title="New clip">
          <form action={saveClip} className="grid gap-4 sm:grid-cols-2"><Slug slug={creator.slug} />
            <Field label="Source video"><VideoSelect name="source_video_id" videos={videos || []} /></Field>
            <Field label="Clip title"><input name="title" className="input" required /></Field>
            <Field label="Start (seconds)"><input name="start_s" type="number" step="0.1" className="input" defaultValue={0} /></Field>
            <Field label="End (seconds)" hint="Max 3 minutes"><input name="end_s" type="number" step="0.1" className="input" defaultValue={30} /></Field>
            <Field label="Caption" className="sm:col-span-2"><input name="caption" className="input" /></Field>
            <Field label="Button text"><input name="cta_label" className="input" defaultValue="Join to watch the full video" /></Field>
            <div className="self-end"><SubmitButton>Create clip</SubmitButton></div>
          </form>
        </Card>
      ) : <ReadOnlyNotice />}
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Clip</th><th>Status</th><th>Views</th><th>Clicks to join</th><th>Share</th></tr></thead>
        <tbody>{(clips || []).map((c: any) => {
          const url = `${APP_URL}/${creator.slug}/clip/${c.slug}`;
          return (
            <tr key={c.id}><td className="font-medium">{c.title}<div className="text-xs text-zinc-500">{c.start_s}s – {c.end_s}s</div></td><td><StatusBadge status={c.clip?.status || 'processing'} /></td>
              <td>{c.views}</td><td>{c.clicks} {c.views ? <span className="text-xs text-zinc-500">({Math.round((c.clicks / c.views) * 100)}%)</span> : null}</td>
              <td className="space-x-2 whitespace-nowrap"><CopyButton text={url} label="Copy link" />{c.clip?.mux_playback_id && <a className="btn-ghost btn-sm" href={`https://stream.mux.com/${c.clip.mux_playback_id}/high.mp4?download=${c.slug}.mp4`}>MP4</a>}</td></tr>
          );
        })}</tbody></table></div>
      <p className="hint">MP4 download needs "MP4 support" enabled on the clip asset in Mux (Settings → Static renditions) — or use the share link directly.</p>
    </div>
  );
}
