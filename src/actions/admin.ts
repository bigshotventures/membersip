'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { refundPayment, cancelSubscription } from '@/lib/razorpay';
import { notify } from '@/lib/notify';
import { bool, int, str, strOrNull, toPaise, slugify } from '@/lib/utils';

function back(path: string, notice?: string): never {
  revalidatePath(path);
  redirect(notice ? `${path}${path.includes('?') ? '&' : '?'}notice=${encodeURIComponent(notice)}` : path);
}

async function userByEmail(email: string, name?: string | null) {
  const db = admin();
  const { data: p } = await db.from('profiles').select('id').eq('email', email.toLowerCase()).maybeSingle();
  if (p) return p.id as string;
  const { data, error } = await db.auth.admin.createUser({ email: email.toLowerCase(), email_confirm: true, user_metadata: { full_name: name || undefined } });
  if (error) throw error;
  return data.user.id as string;
}

export async function createCreator(fd: FormData) {
  const me = await requireStaff();
  const db = admin();
  const slug = slugify(str(fd, 'slug') || str(fd, 'name'));
  const { data: c, error } = await db.from('creators').insert({
    slug, name: str(fd, 'name'), commission_pct: fd.get('commission_pct') ? Number(fd.get('commission_pct')) : null, status: 'draft',
  }).select('id').single();
  if (error) back('/admin/creators', error.code === '23505' ? 'That URL is taken' : error.message);
  const ownerEmail = strOrNull(fd, 'owner_email');
  if (ownerEmail) {
    const uid = await userByEmail(ownerEmail, strOrNull(fd, 'owner_name'));
    await db.from('creator_team').insert({ creator_id: c.id, user_id: uid, role: 'owner' });
    await db.from('profiles').update({ role: 'creator' }).eq('id', uid).eq('role', 'member');
  }
  // sensible defaults so the page isn't empty
  await db.from('spaces').insert([
    { creator_id: c.id, name: 'General', description: 'Say hi and chat about anything', position: 0 },
    { creator_id: c.id, name: 'Wins', description: 'Share your progress', position: 1 },
    { creator_id: c.id, name: 'Chat', kind: 'chat', position: 2 },
  ]);
  await db.from('levels').insert([
    { creator_id: c.id, level: 1, name: 'Newbie', min_points: 0 }, { creator_id: c.id, level: 2, name: 'Regular', min_points: 100 },
    { creator_id: c.id, level: 3, name: 'Insider', min_points: 500 }, { creator_id: c.id, level: 4, name: 'Legend', min_points: 2000 },
  ]);
  await db.from('badges').insert([
    { creator_id: c.id, code: 'streak_7', name: '7-day streak', icon: '🔥', rule: { type: 'streak', gte: 7 } },
    { creator_id: c.id, code: 'year_one', name: '1 year member', icon: '🎂', rule: { type: 'tenure_months', gte: 12 } },
    { creator_id: c.id, code: 'points_500', name: 'Super fan', icon: '⭐', rule: { type: 'points', gte: 500 } },
  ]);
  await audit(me.id, 'creator.create', { creatorId: c.id });
  redirect(`/studio/${slug}/settings?notice=${encodeURIComponent('Creator created — set up the page, tiers and content')}`);
}

export async function updateCreator(fd: FormData) {
  const me = await requireStaff();
  const id = str(fd, 'id');
  const acct = str(fd, 'bank_account');
  await admin().from('creators').update({
    status: str(fd, 'status'), verified: bool(fd, 'verified'), commission_pct: fd.get('commission_pct') === '' ? null : Number(fd.get('commission_pct')),
    legal_name: strOrNull(fd, 'legal_name'), pan: strOrNull(fd, 'pan')?.toUpperCase() ?? null, gstin: strOrNull(fd, 'gstin')?.toUpperCase() ?? null,
    address: strOrNull(fd, 'address'), kyc_status: str(fd, 'kyc_status'), bank_account_name: strOrNull(fd, 'bank_account_name'),
    ...(acct ? { bank_account_last4: acct.slice(-4) } : {}), bank_ifsc: strOrNull(fd, 'bank_ifsc')?.toUpperCase() ?? null,
    razorpay_account_id: strOrNull(fd, 'razorpay_account_id'), custom_domain: strOrNull(fd, 'custom_domain'),
  }).eq('id', id);
  await audit(me.id, 'creator.update', { creatorId: id, meta: { status: str(fd, 'status') } });
  back(`/admin/creators/${id}`, 'Saved');
}

export async function refund(fd: FormData) {
  const me = await requireStaff();
  const db = admin();
  const { data: p } = await db.from('payments').select('*').eq('id', str(fd, 'id')).single();
  const amount = toPaise(fd.get('amount')) || p.amount_paise - p.refunded_paise;
  if (amount <= 0 || amount > p.amount_paise - p.refunded_paise) back('/admin/payments', 'Invalid refund amount');
  const rf = await refundPayment(p.razorpay_payment_id, amount, { reason: str(fd, 'reason') });
  const total = p.refunded_paise + amount;
  await db.from('refunds').insert({ payment_id: p.id, amount_paise: amount, reason: strOrNull(fd, 'reason'), razorpay_refund_id: rf.id, created_by: me.id });
  await db.from('payments').update({ refunded_paise: total, status: total >= p.amount_paise ? 'refunded' : 'partially_refunded' }).eq('id', p.id);
  if (p.order_id) await db.from('orders').update({ status: total >= p.amount_paise ? 'refunded' : 'partially_refunded' }).eq('id', p.order_id);
  if (bool(fd, 'revoke') && p.order_id) {
    const { data: o } = await db.from('orders').select('*').eq('id', p.order_id).single();
    await db.from('entitlements').delete().eq('order_id', o.id);
    if (o.kind === 'membership' || p.membership_id) {
      const { data: m } = await db.from('memberships').select('*').eq('id', p.membership_id || '').maybeSingle();
      if (m?.razorpay_subscription_id) await cancelSubscription(m.razorpay_subscription_id, false).catch(() => null);
      if (m) await db.from('memberships').update({ status: 'expired', current_period_end: new Date().toISOString() }).eq('id', m.id);
    }
  }
  await notify({ userId: p.user_id, creatorId: p.creator_id, kind: 'refund', transactional: true, title: 'Refund initiated', body: `₹${(amount / 100).toFixed(2)} will reach your original payment method in 5–7 working days.`, link: '/account/billing' });
  await audit(me.id, 'payment.refund', { creatorId: p.creator_id, entity: 'payment', entityId: p.id, meta: { amount } });
  back('/admin/payments', 'Refund initiated');
}

/** Bundle unpaid payments (and partner splits) for a creator into a payout. */
export async function createPayout(fd: FormData) {
  const me = await requireStaff();
  const db = admin();
  const creatorId = str(fd, 'creator_id');
  const until = new Date(`${str(fd, 'until')}T23:59:59+05:30`).toISOString();
  const { data: pays } = await db.from('payments').select('*').eq('creator_id', creatorId).is('payout_id', null).lte('created_at', until);
  const { data: splitsIn } = await db.from('payment_splits').select('*').eq('creator_id', creatorId).is('payout_id', null);
  const own = pays || [];
  if (!own.length && !splitsIn?.length) back('/admin/payouts', 'Nothing to pay out');
  // payments that are split: creator only gets their split row, not the full net
  const { data: splitRowsForOwn } = own.length ? await db.from('payment_splits').select('payment_id').in('payment_id', own.map((p: any) => p.id)) : { data: [] };
  const splitPaymentIds = new Set((splitRowsForOwn || []).map((r: any) => r.payment_id));
  const sum = (k: string) => own.reduce((a: number, p: any) => a + p[k], 0);
  const refunds = own.reduce((a: number, p: any) => a + Math.round(p.creator_net_paise * (p.refunded_paise / p.amount_paise)), 0);
  const netOwn = own.filter((p: any) => !splitPaymentIds.has(p.id)).reduce((a: number, p: any) => a + p.creator_net_paise, 0);
  const netSplits = (splitsIn || []).reduce((a: number, s: any) => a + s.amount_paise, 0);
  const dates = own.map((p: any) => p.created_at).sort();
  const { data: po } = await db.from('payouts').insert({
    creator_id: creatorId, period_start: (dates[0] || new Date().toISOString()).slice(0, 10), period_end: until.slice(0, 10),
    gross_paise: sum('amount_paise'), gst_paise: sum('gst_paise'), platform_fee_paise: sum('platform_fee_paise'), tds_paise: sum('tds_paise'),
    refunds_paise: refunds, net_paise: Math.max(0, netOwn + netSplits - refunds),
  }).select('id').single();
  if (own.length) await db.from('payments').update({ payout_id: po.id }).in('id', own.map((p: any) => p.id));
  if (splitsIn?.length) await db.from('payment_splits').update({ payout_id: po.id }).in('id', splitsIn.map((s: any) => s.id));
  await audit(me.id, 'payout.create', { creatorId, entity: 'payout', entityId: po.id });
  back('/admin/payouts', 'Payout created — transfer the net amount and mark it paid');
}

export async function markPayoutPaid(fd: FormData) {
  const me = await requireStaff();
  const db = admin();
  const { data: po } = await db.from('payouts').update({ status: 'paid', utr: str(fd, 'utr'), paid_at: new Date().toISOString() }).eq('id', str(fd, 'id')).select('*').single();
  const { data: owners } = await db.from('creator_team').select('user_id').eq('creator_id', po.creator_id).in('role', ['owner', 'accountant']);
  for (const o of owners || []) await notify({ userId: o.user_id, creatorId: po.creator_id, kind: 'payout', transactional: true, title: 'Payout sent 💸', body: `₹${(po.net_paise / 100).toLocaleString('en-IN')} sent to your bank. UTR ${po.utr}.`, link: '/me' });
  await audit(me.id, 'payout.paid', { creatorId: po.creator_id, entity: 'payout', entityId: po.id });
  back('/admin/payouts', 'Marked as paid');
}

export async function saveSettings(fd: FormData) {
  const me = await requireStaff();
  if (me.role !== 'admin') back('/admin/settings', 'Only admins can change platform settings');
  await admin().from('platform_settings').update({
    company_name: str(fd, 'company_name'), brand_name: str(fd, 'brand_name'), gstin: strOrNull(fd, 'gstin'), pan: strOrNull(fd, 'pan'),
    state_code: str(fd, 'state_code'), address: strOrNull(fd, 'address'), support_email: strOrNull(fd, 'support_email'),
    gst_rate: Number(fd.get('gst_rate')), tds_rate: Number(fd.get('tds_rate')), prices_include_gst: bool(fd, 'prices_include_gst'),
    default_commission_pct: Number(fd.get('default_commission_pct')), invoice_prefix: str(fd, 'invoice_prefix'),
    dunning_grace_days: int(fd, 'dunning_grace_days', 7), updated_at: new Date().toISOString(),
  }).eq('id', true);
  await audit(me.id, 'settings.update');
  back('/admin/settings', 'Saved');
}

export async function setUserRole(fd: FormData) {
  const me = await requireStaff();
  if (me.role !== 'admin') back('/admin/users', 'Only admins can change roles');
  await admin().from('profiles').update({ role: str(fd, 'role') }).eq('id', str(fd, 'id'));
  await audit(me.id, 'user.role', { entity: 'user', entityId: str(fd, 'id'), meta: { role: str(fd, 'role') } });
  back('/admin/users', 'Role updated');
}

export async function resolveDataRequest(fd: FormData) {
  const me = await requireStaff();
  const db = admin();
  const { data: r } = await db.from('data_requests').select('*').eq('id', str(fd, 'id')).single();
  const decision = str(fd, 'decision');
  if (decision === 'completed' && r.kind === 'deletion') {
    const { data: ms } = await db.from('memberships').select('razorpay_subscription_id').eq('user_id', r.user_id).not('razorpay_subscription_id', 'is', null);
    for (const m of ms || []) await cancelSubscription(m.razorpay_subscription_id, false).catch(() => null);
    // Anonymise instead of hard delete so GST invoices (legally retained) stay consistent
    await db.from('profiles').update({ full_name: 'Deleted user', email: null, phone: null, avatar_url: null, bio: null, email_opt_in: false, whatsapp_opt_in: false, deleted_at: new Date().toISOString() }).eq('id', r.user_id);
    await db.from('memberships').update({ status: 'expired' }).eq('user_id', r.user_id);
    await db.from('comments').delete().eq('author_id', r.user_id);
    await db.from('space_posts').delete().eq('author_id', r.user_id);
    await db.from('chat_messages').delete().eq('author_id', r.user_id);
    await db.from('direct_messages').delete().eq('member_id', r.user_id);
    await db.auth.admin.updateUserById(r.user_id, { email: `deleted-${r.user_id}@deleted.invalid`, phone: '', ban_duration: '876000h' }).catch(() => null);
  }
  await db.from('data_requests').update({ status: decision, completed_at: new Date().toISOString(), note: strOrNull(fd, 'note') ?? r.note }).eq('id', r.id);
  await audit(me.id, `data_request.${decision}`, { entity: 'data_request', entityId: r.id });
  back('/admin/compliance', 'Request updated');
}

export async function updateServiceOrder(fd: FormData) {
  const me = await requireStaff();
  const db = admin();
  const { data: so } = await db.from('service_orders').update({ status: str(fd, 'status'), price_paise: toPaise(fd.get('price')) ?? undefined, assigned_to: me.id }).eq('id', str(fd, 'id')).select('*, creator:creators(slug)').single();
  if (so.status === 'quoted') {
    const { data: owners } = await db.from('creator_team').select('user_id').eq('creator_id', so.creator_id).eq('role', 'owner');
    for (const o of owners || []) await notify({ userId: o.user_id, creatorId: so.creator_id, kind: 'service_quote', title: 'Your service quote is ready', body: `Quote: ₹${(so.price_paise / 100).toLocaleString('en-IN')}`, link: `/studio/${so.creator.slug}/services` });
  }
  back('/admin/services', 'Updated');
}

export async function saveServicePackage(fd: FormData) {
  await requireStaff();
  const id = strOrNull(fd, 'id');
  const row = { code: slugify(str(fd, 'title')).replace(/-/g, '_'), title: str(fd, 'title'), description: strOrNull(fd, 'description'), price_paise: toPaise(fd.get('price')) || 0, active: !bool(fd, 'inactive') };
  if (id) await admin().from('service_packages').update(row).eq('id', id); else await admin().from('service_packages').insert(row);
  back('/admin/services', 'Saved');
}
