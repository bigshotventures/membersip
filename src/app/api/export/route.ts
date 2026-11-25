import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/auth';

/** DPDP Act: let a member download all personal data we hold about them. */
export async function GET() {
  const p = await getProfile();
  if (!p) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  const db = admin();
  const tables: [string, string][] = [
    ['memberships', 'user_id'], ['orders', 'user_id'], ['payments', 'user_id'], ['invoices', 'user_id'], ['entitlements', 'user_id'],
    ['enrollments', 'user_id'], ['lesson_progress', 'user_id'], ['quiz_attempts', 'user_id'], ['submissions', 'user_id'], ['certificates', 'user_id'],
    ['comments', 'author_id'], ['space_posts', 'author_id'], ['chat_messages', 'author_id'], ['direct_messages', 'member_id'], ['reactions', 'user_id'],
    ['bookings', 'user_id'], ['reviews', 'user_id'], ['member_stats', 'user_id'], ['user_badges', 'user_id'], ['challenge_checkins', 'user_id'],
    ['notifications', 'user_id'], ['consents', 'user_id'], ['data_requests', 'user_id'], ['cancel_feedback', 'user_id'], ['referrals', 'referrer_id'],
  ];
  const out: Record<string, any> = { exported_at: new Date().toISOString(), profile: p };
  for (const [t, col] of tables) out[t] = (await db.from(t).select('*').eq(col, p.id)).data;
  await db.from('data_requests').insert({ user_id: p.id, kind: 'export', status: 'completed', completed_at: new Date().toISOString() });
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="my-data.json"' },
  });
}
