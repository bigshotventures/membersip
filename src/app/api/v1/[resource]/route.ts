import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { announcePost } from '@/lib/posts';

async function auth(req: Request) {
  const key = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!key) return null;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const { data } = await admin().from('api_keys').select('id, creator_id').eq('key_hash', hash).is('revoked_at', null).maybeSingle();
  if (data) await admin().from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data;
}

const page = (req: Request) => {
  const u = new URL(req.url);
  const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 200), offset = Number(u.searchParams.get('offset')) || 0;
  return { limit, offset };
};

export async function GET(req: Request, { params }: { params: { resource: string } }) {
  const k = await auth(req);
  if (!k) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  const { limit, offset } = page(req);
  const db = admin();
  switch (params.resource) {
    case 'members': {
      const { data } = await db.from('memberships').select('id, status, billing_period, started_at, current_period_end, tier:tiers!memberships_tier_id_fkey(id, name), user:profiles!memberships_user_id_fkey(id, full_name, email)').eq('creator_id', k.creator_id).order('started_at', { ascending: false }).range(offset, offset + limit - 1);
      return NextResponse.json({ data });
    }
    case 'orders': {
      const { data } = await db.from('orders').select('id, kind, item_id, total_paise, status, created_at, paid_at, meta').eq('creator_id', k.creator_id).eq('status', 'paid').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      return NextResponse.json({ data });
    }
    case 'posts': {
      const { data } = await db.from('posts').select('id, title, excerpt, visibility, status, published_at').eq('creator_id', k.creator_id).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      return NextResponse.json({ data });
    }
    default:
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function POST(req: Request, { params }: { params: { resource: string } }) {
  const k = await auth(req);
  if (!k) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  if (params.resource !== 'posts') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (!b.title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  const db = admin();
  const status = b.publish ? 'published' : 'draft';
  const { data: post, error } = await db.from('posts').insert({
    creator_id: k.creator_id, title: String(b.title).slice(0, 200), excerpt: b.excerpt ?? null,
    visibility: ['public', 'members'].includes(b.visibility) ? b.visibility : 'members', status,
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await db.from('post_bodies').insert({ post_id: post.id, body: String(b.body || '') });
  if (status === 'published') await announcePost(post.id);
  return NextResponse.json({ data: { id: post.id, status } }, { status: 201 });
}
