import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next') || '/me';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/me';
  if (code) {
    const sb = createClient();
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
    const uid = data.user?.id;
    if (uid) {
      const db = admin();
      const { count } = await db.from('consents').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('purpose', 'terms_privacy');
      if (!count) {
        const mk = url.searchParams.get('mk') === '1', wa = url.searchParams.get('wa') === '1';
        await db.from('consents').insert([
          { user_id: uid, purpose: 'terms_privacy', granted: true },
          { user_id: uid, purpose: 'marketing_email', granted: mk },
          { user_id: uid, purpose: 'whatsapp', granted: wa },
        ]);
        await db.from('profiles').update({ email_opt_in: mk, whatsapp_opt_in: wa }).eq('id', uid);
      }
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
