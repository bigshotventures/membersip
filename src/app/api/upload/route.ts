import { NextResponse } from 'next/server';
import { getProfile, studioPerms } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { signedUpload, publicUrl } from '@/lib/storage';

const MAX_PUBLIC = 20 * 1024 * 1024, MAX_PRIVATE = 500 * 1024 * 1024;

export async function POST(req: Request) {
  const p = await getProfile();
  if (!p) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { scope, creatorId, bucket = 'public', filename = 'file', size = 0 } = await req.json();
  const clean = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const rand = crypto.randomUUID().slice(0, 8);
  if (size > (bucket === 'public' ? MAX_PUBLIC : MAX_PRIVATE)) return NextResponse.json({ error: 'File too large' }, { status: 400 });

  let path: string;
  if (scope === 'avatar') {
    if (bucket !== 'public') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    path = `avatars/${p.id}/${rand}-${clean}`;
  } else if (scope === 'community') {
    const { data: ok } = await admin().from('memberships').select('id').eq('creator_id', creatorId).eq('user_id', p.id).in('status', ['active', 'trialing', 'past_due']).maybeSingle();
    const { data: c } = await admin().from('creators').select('*').eq('id', creatorId).single();
    const perms = c ? await studioPerms(c, p) : null;
    if (!ok && !perms?.view) return NextResponse.json({ error: 'Members only' }, { status: 403 });
    if (bucket !== 'public') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    path = `community/${creatorId}/${p.id}/${rand}-${clean}`;
  } else if (scope === 'submission') {
    path = `submissions/${p.id}/${rand}-${clean}`;
    if (bucket !== 'private') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  } else if (scope === 'studio') {
    const { data: c } = await admin().from('creators').select('*').eq('id', creatorId).single();
    if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const perms = await studioPerms(c, p);
    if (!perms.manage) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    path = `creators/${creatorId}/${rand}-${clean}`;
  } else {
    return NextResponse.json({ error: 'Unknown scope' }, { status: 400 });
  }
  const up = await signedUpload(bucket, path);
  return NextResponse.json({ signedUrl: up.signedUrl, path, publicUrl: bucket === 'public' ? publicUrl(path) : null });
}
