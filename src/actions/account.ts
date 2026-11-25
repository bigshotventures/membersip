'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { admin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getUser, requireProfile } from '@/lib/auth';
import { redeemGift } from '@/lib/fulfillment';
import { bool, str, strOrNull } from '@/lib/utils';

export async function recordSignupConsent(o: { marketing: boolean; whatsapp: boolean }) {
  const user = await getUser();
  if (!user) return;
  const db = admin();
  const { count } = await db.from('consents').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('purpose', 'terms_privacy');
  if (count) return;
  await db.from('consents').insert([
    { user_id: user.id, purpose: 'terms_privacy', granted: true },
    { user_id: user.id, purpose: 'marketing_email', granted: o.marketing },
    { user_id: user.id, purpose: 'whatsapp', granted: o.whatsapp },
  ]);
  await db.from('profiles').update({ email_opt_in: o.marketing, whatsapp_opt_in: o.whatsapp }).eq('id', user.id);
}

export async function updateProfile(fd: FormData) {
  const p = await requireProfile('/account');
  const email_opt_in = bool(fd, 'email_opt_in'), whatsapp_opt_in = bool(fd, 'whatsapp_opt_in');
  const phone = strOrNull(fd, 'phone');
  const db = admin();
  await db.from('profiles').update({
    full_name: str(fd, 'full_name').slice(0, 80) || null, bio: strOrNull(fd, 'bio'), avatar_url: strOrNull(fd, 'avatar_url'),
    phone, state_code: strOrNull(fd, 'state_code'), email_opt_in, whatsapp_opt_in,
  }).eq('id', p.id);
  if (email_opt_in !== p.email_opt_in) await db.from('consents').insert({ user_id: p.id, purpose: 'marketing_email', granted: email_opt_in });
  if (whatsapp_opt_in !== p.whatsapp_opt_in) await db.from('consents').insert({ user_id: p.id, purpose: 'whatsapp', granted: whatsapp_opt_in });
  revalidatePath('/account');
  redirect('/account?saved=1');
}

export async function requestDataAction(fd: FormData) {
  const p = await requireProfile('/account/privacy');
  const kind = str(fd, 'kind');
  if (!['deletion', 'correction'].includes(kind)) return;
  await admin().from('data_requests').insert({ user_id: p.id, kind, note: strOrNull(fd, 'note') });
  revalidatePath('/account/privacy');
  redirect('/account/privacy?requested=1');
}

export async function markAllRead() {
  const p = await requireProfile('/notifications');
  await admin().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', p.id).is('read_at', null);
  revalidatePath('/notifications');
}

export async function redeemGiftAction(fd: FormData) {
  const p = await requireProfile('/gift/redeem');
  let res: { redirect: string; message: string };
  try {
    res = await redeemGift(str(fd, 'code'), p.id);
  } catch (e: any) {
    redirect(`/gift/redeem?code=${encodeURIComponent(str(fd, 'code'))}&error=${encodeURIComponent(e.message)}`);
  }
  redirect(`${res!.redirect}?notice=${encodeURIComponent(res!.message)}`);
}

export async function signOutEverywhere() {
  await createClient().auth.signOut({ scope: 'global' });
  redirect('/');
}
