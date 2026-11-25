import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Empty, Field, Notice, PageHeader, ReadOnlyNotice, StatusBadge } from '@/components/ui';
import { FileUpload, MultiFileUpload, SubmitButton } from '@/components/client';
import { MarkdownArea, Slug, TierPicker, VideoSelect, VisibilitySelect } from '@/components/studio/bits';
import { deletePost, savePost } from '@/actions/studio/content';
import { fmtDate, inr, isoToIstLocal } from '@/lib/utils';

export default async function Posts({ params, searchParams }: { params: { creator: string }; searchParams: { edit?: string; notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const slug = creator.slug;
  const [{ data: posts }, { data: tiers }, { data: videos }] = await Promise.all([
    db.from('posts').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false }).limit(200),
    db.from('tiers').select('id, name').eq('creator_id', creator.id).order('position'),
    db.from('videos').select('id, title, status').eq('creator_id', creator.id).order('created_at', { ascending: false }),
  ]);
  const editing = searchParams.edit === 'new' ? {} as any : (posts || []).find((p: any) => p.id === searchParams.edit);
  const { data: body } = editing?.id ? await db.from('post_bodies').select('*').eq('post_id', editing.id).maybeSingle() : { data: null };

  if (editing && perms.manage) {
    return (
      <div className="max-w-3xl">
        <PageHeader title={editing.id ? 'Edit post' : 'New post'} actions={<Link href={`/studio/${slug}/posts`} className="btn-ghost btn-sm">← All posts</Link>} />
        <form action={savePost} className="space-y-5">
          <Slug slug={slug} />{editing.id && <input type="hidden" name="id" value={editing.id} />}
          <Card>
            <div className="space-y-4">
              <Field label="Title"><input name="title" className="input text-lg" defaultValue={editing.title} required /></Field>
              <Field label="Teaser (shown to non-members)"><input name="excerpt" className="input" defaultValue={editing.excerpt || ''} maxLength={300} /></Field>
              <Field label="Body"><MarkdownArea name="body" defaultValue={body?.body} rows={14} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type"><select name="kind" className="input" defaultValue={editing.kind || 'text'}>{['text', 'image', 'video', 'gallery', 'poll', 'file', 'audio'].map((k) => <option key={k}>{k}</option>)}</select></Field>
                <Field label="Video"><VideoSelect videos={videos || []} value={body?.video_id} /></Field>
              </div>
              <Field label="Cover image"><FileUpload name="cover_url" scope="studio" creatorId={creator.id} accept="image/*" defaultValue={editing.cover_url} /></Field>
              <Field label="Gallery images"><MultiFileUpload name="images" scope="studio" creatorId={creator.id} defaultValue={body?.images || []} /></Field>
              <Field label="Downloads (PDFs are stamped with the member's name)" hint="Upload one file per field">
                <div className="space-y-2">
                  {(body?.attachments || []).map((a: any, i: number) => <FileUpload key={i} name="attachment_path" scope="studio" creatorId={creator.id} bucket="private" defaultValue={a.path} />)}
                  <FileUpload name="attachment_path" scope="studio" creatorId={creator.id} bucket="private" label="Add file" />
                </div>
              </Field>
            </div>
          </Card>
          <Card title="Poll (optional)">
            <div className="space-y-3">
              <input name="poll_question" className="input" placeholder="Question" />
              <textarea name="poll_options" className="input" rows={3} placeholder="One option per line" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="poll_multiple" /> Allow multiple choices</label>
              {editing.id && <p className="hint">A post can have one poll; existing polls aren't changed.</p>}
            </div>
          </Card>
          <Card title="Access & publishing">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Who can see it"><VisibilitySelect value={editing.visibility} /></Field>
              <Field label="Pay-per-view price (₹)" hint="Only for pay-per-view posts"><input name="ppv_price" className="input" defaultValue={editing.ppv_price_paise ? editing.ppv_price_paise / 100 : ''} /></Field>
              <div className="sm:col-span-2"><TierPicker tiers={tiers || []} selected={editing.tier_ids || []} hint="For 'Selected tiers'. For pay-per-view, ticked tiers get it free." /></div>
              <Field label="Schedule for (IST)"><input type="datetime-local" name="publish_at" className="input" defaultValue={isoToIstLocal(editing.publish_at)} /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="pinned" defaultChecked={editing.pinned} /> Pin to top</label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button name="action" value="publish" className="btn-primary">Publish now</button>
              <button name="action" value="schedule" className="btn-outline">Schedule</button>
              <button name="action" value="draft" className="btn-ghost">Save draft</button>
            </div>
          </Card>
        </form>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Posts" subtitle="Text, images, video, polls and downloads" actions={perms.manage && <Link href="?edit=new" className="btn-primary">New post</Link>} />
      {searchParams.notice && <div className="mb-4"><Notice tone="success">{searchParams.notice}</Notice></div>}
      {!perms.manage && <div className="mb-4"><ReadOnlyNotice /></div>}
      {!posts?.length ? <Empty title="No posts yet" /> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Title</th><th>Access</th><th>Status</th><th>Date</th><th /></tr></thead>
            <tbody>
              {posts.map((p: any) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.pinned && '📌 '}{p.title}</td>
                  <td className="text-sm">{p.visibility === 'ppv' ? `PPV ${inr(p.ppv_price_paise)}` : p.visibility}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="text-sm text-zinc-500">{fmtDate(p.status === 'scheduled' ? p.publish_at : p.published_at || p.created_at, true)}</td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/${slug}/posts/${p.id}`} className="btn-ghost btn-sm" target="_blank">View</Link>
                    {perms.manage && <Link href={`?edit=${p.id}`} className="btn-ghost btn-sm">Edit</Link>}
                    {perms.manage && <form action={deletePost} className="inline"><Slug slug={slug} /><input type="hidden" name="id" value={p.id} /><SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Delete this post?">Delete</SubmitButton></form>}
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
