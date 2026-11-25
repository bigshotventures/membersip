import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { readPrivate, signedDownload } from '@/lib/storage';
import { stampPdf } from '@/lib/pdf';

/** Gated downloads: /api/files?type=post|lesson|product|submission&id=...&i=0 — PDFs are stamped with the buyer's identity. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type'), id = url.searchParams.get('id')!, i = Number(url.searchParams.get('i') || 0);
  const p = await getProfile();
  if (!p) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, url.origin));
  const db = admin(), sb = createClient();
  let file: { name: string; path: string; stamp?: boolean } | null = null;

  if (type === 'post') {
    if (!(await sb.rpc('can_read_post', { p: id })).data) return NextResponse.json({ error: 'No access' }, { status: 403 });
    const { data } = await db.from('post_bodies').select('attachments').eq('post_id', id).single();
    file = data?.attachments?.[i] ?? null;
  } else if (type === 'lesson') {
    if (!(await sb.rpc('can_read_lesson', { lid: id })).data) return NextResponse.json({ error: 'No access' }, { status: 403 });
    const { data } = await db.from('lesson_contents').select('file_path, stamp_pdf').eq('lesson_id', id).single();
    if (data?.file_path) file = { name: data.file_path.split('/').pop(), path: data.file_path, stamp: data.stamp_pdf };
  } else if (type === 'product') {
    const { data: prod } = await db.from('products').select('creator_id, files').eq('id', id).single();
    const { data: ent } = await db.from('entitlements').select('id').eq('user_id', p.id).eq('kind', 'product').eq('item_id', id).maybeSingle();
    const studio = prod ? (await sb.rpc('can_view_studio', { c: prod.creator_id })).data : false;
    if (!ent && !studio) return NextResponse.json({ error: 'Purchase required' }, { status: 403 });
    file = prod?.files?.[i] ?? null;
  } else if (type === 'submission') {
    const { data: s } = await sb.from('submissions').select('file_path').eq('id', id).maybeSingle(); // RLS: owner or grader
    if (s?.file_path) file = { name: s.file_path.split('/').pop(), path: s.file_path };
  }
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  if (file.stamp !== false && /\.pdf$/i.test(file.path)) {
    const bytes = await readPrivate(file.path);
    const stamped = await stampPdf(bytes, `${p.full_name || ''} <${p.email || p.phone || p.id}>`);
    return new NextResponse(Buffer.from(stamped), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`, 'Cache-Control': 'private, no-store' },
    });
  }
  return NextResponse.redirect(await signedDownload(file.path, 120, file.name));
}
