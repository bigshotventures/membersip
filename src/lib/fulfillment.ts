import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { getSettings, gstBreakup, splitAmount } from '@/lib/money';
import { notify } from '@/lib/notify';
import { fireEvent } from '@/lib/events';
import { createMeeting } from '@/lib/zoom';
import { refundPayment } from '@/lib/razorpay';
import { layout, sendEmail } from '@/lib/email';
import { addMonths, APP_URL, inr, PERIOD_MONTHS, fmtDate } from '@/lib/utils';

const db = () => admin();

/** Ledger entry + revenue split + GST invoice. Idempotent on the Razorpay payment id. */
export async function recordPayment(p: {
  rzpPaymentId: string; method?: string | null; amountPaise: number; userId: string; creatorId: string;
  kind: string; orderId?: string | null; membershipId?: string | null; itemId?: string | null; description: string; buyerState?: string | null;
}) {
  const { data: exists } = await db().from('payments').select('id').eq('razorpay_payment_id', p.rzpPaymentId).maybeSingle();
  if (exists) return exists.id as string;
  if (p.amountPaise <= 0) return null;

  const s = await getSettings();
  const { data: creator } = await db().from('creators').select('commission_pct').eq('id', p.creatorId).single();
  const sp = splitAmount(p.amountPaise, s, creator?.commission_pct === null ? null : Number(creator?.commission_pct));

  const { data: pay, error } = await db().from('payments').insert({
    order_id: p.orderId ?? null, membership_id: p.membershipId ?? null, user_id: p.userId, creator_id: p.creatorId,
    kind: p.kind, razorpay_payment_id: p.rzpPaymentId, method: p.method ?? null, amount_paise: p.amountPaise,
    taxable_paise: sp.taxable, gst_paise: sp.gst, platform_fee_paise: sp.fee, tds_paise: sp.tds, creator_net_paise: sp.net,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return null; // raced with webhook
    throw error;
  }

  // Collaboration splits: partner creators receive a % of the creator's net
  if (p.itemId) {
    const { data: splits } = await db().from('revenue_splits').select('*').eq('item_id', p.itemId);
    let remaining = sp.net;
    for (const x of splits || []) {
      const amt = Math.round((sp.net * Number(x.pct)) / 100);
      remaining -= amt;
      await db().from('payment_splits').insert({ payment_id: pay.id, creator_id: x.partner_creator_id, amount_paise: amt });
    }
    if (splits?.length) await db().from('payment_splits').insert({ payment_id: pay.id, creator_id: p.creatorId, amount_paise: remaining });
  }

  // GST invoice
  const { data: buyer } = await db().from('profiles').select('full_name, email, phone, state_code').eq('id', p.userId).single();
  const buyerState = p.buyerState || buyer?.state_code || null;
  const g = gstBreakup(sp.gst, buyerState, s);
  const { data: number } = await db().rpc('next_invoice_number');
  await db().from('invoices').insert({
    payment_id: pay.id, invoice_number: number, user_id: p.userId, creator_id: p.creatorId,
    buyer: { name: buyer?.full_name, email: buyer?.email, phone: buyer?.phone, state_code: buyerState },
    seller: { name: s.company_name, address: s.address, gstin: s.gstin, state_code: s.state_code },
    line_description: p.description.slice(0, 120), taxable_paise: sp.taxable,
    cgst_paise: g.cgst, sgst_paise: g.sgst, igst_paise: g.igst, total_paise: p.amountPaise,
    place_of_supply: buyerState || s.state_code,
  });
  return pay.id as string;
}

async function upsertMembership(o: {
  userId: string; creatorId: string; tierId: string; period: string; status: string; periodEnd: Date | null;
  source: string; subscriptionId?: string | null; referredBy?: string | null;
}) {
  const { data: existing } = await db().from('memberships').select('*').eq('user_id', o.userId).eq('creator_id', o.creatorId).maybeSingle();
  const row = {
    user_id: o.userId, creator_id: o.creatorId, tier_id: o.tierId, billing_period: o.period, status: o.status,
    current_period_end: o.periodEnd?.toISOString() ?? null, source: o.source,
    razorpay_subscription_id: o.subscriptionId ?? existing?.razorpay_subscription_id ?? null,
    cancel_at_period_end: false, cancelled_at: null, paused_until: null, failed_attempts: 0, pending_tier_id: null,
  };
  if (existing) {
    const wasActive = ['active', 'trialing', 'past_due'].includes(existing.status);
    const { data } = await db().from('memberships').update(row).eq('id', existing.id).select('*').single();
    return { membership: data, isNew: !wasActive, tierChanged: wasActive && existing.tier_id !== o.tierId };
  }
  const { data } = await db().from('memberships').insert({ ...row, started_at: new Date().toISOString(), referred_by: o.referredBy ?? null }).select('*').single();
  return { membership: data, isNew: true, tierChanged: false };
}

async function welcome(creatorId: string, userId: string, tierId: string) {
  const { data: c } = await db().from('creators').select('slug, name').eq('id', creatorId).single();
  const { data: t } = await db().from('tiers').select('name').eq('id', tierId).single();
  await notify({
    userId, creatorId, kind: 'welcome', title: `Welcome to ${c.name} ${t?.name ? `(${t.name})` : ''}`.trim(),
    body: 'Your membership is active. Jump into the feed, courses and community.', link: `/${c.slug}`, transactional: true, whatsapp: true,
  });
  await fireEvent(creatorId, 'member_joined', { userId, tierId });
}

async function referral(order: any) {
  if (!order.referral_code) return null;
  const { data: ref } = await db().from('profiles').select('id').eq('referral_code', order.referral_code).maybeSingle();
  if (!ref || ref.id === order.user_id) return null;
  const reward = Math.round((order.total_paise || 0) * 0.1); // 10% store credit to the referrer
  const { error } = await db().from('referrals').insert({ creator_id: order.creator_id, referrer_id: ref.id, referred_id: order.user_id, order_id: order.id, reward_paise: reward });
  if (!error && reward > 0) {
    const { data: rp } = await db().from('profiles').select('credit_paise').eq('id', ref.id).single();
    await db().from('profiles').update({ credit_paise: (rp?.credit_paise || 0) + reward }).eq('id', ref.id);
    await notify({ userId: ref.id, creatorId: order.creator_id, kind: 'referral', title: 'You earned referral credit', body: `${inr(reward)} has been added to your account for referring a friend.`, link: '/account' });
  }
  return ref.id as string;
}

async function afterPaidCommon(order: any) {
  if (order.coupon_id) {
    const { data: c } = await db().from('coupons').select('redeemed_count').eq('id', order.coupon_id).single();
    await db().from('coupons').update({ redeemed_count: (c?.redeemed_count || 0) + 1 }).eq('id', order.coupon_id);
  }
  if (order.credit_used_paise > 0) {
    const { data: p } = await db().from('profiles').select('credit_paise').eq('id', order.user_id).single();
    await db().from('profiles').update({ credit_paise: Math.max(0, (p?.credit_paise || 0) - order.credit_used_paise) }).eq('id', order.user_id);
  }
  if (order.ab_variant?.test_id) {
    await db().from('ab_events').insert({ test_id: order.ab_variant.test_id, variant: order.ab_variant.variant, visitor_id: order.ab_variant.visitor_id || order.user_id, event: 'conversion' });
  }
}

/** One-off orders (and lifetime memberships). Safe to call twice. */
export async function handleOrderPaid(orderId: string, rzpPaymentId: string, method?: string | null) {
  const { data: order } = await db().from('orders').select('*').eq('id', orderId).single();
  if (!order || order.status === 'paid' || order.status === 'refunded') return order;
  const { data: claimed } = await db().from('orders').update({ status: 'paid', paid_at: new Date().toISOString(), razorpay_payment_id: rzpPaymentId })
    .eq('id', orderId).in('status', ['created', 'failed']).select('id');
  if (!claimed?.length) return order; // another request already fulfilled it

  const { data: creator } = await db().from('creators').select('id, slug, name').eq('id', order.creator_id).single();
  const base = `/${creator.slug}`;
  const meta = order.meta || {};
  let membershipId: string | null = null;
  let link = base;
  const ent = (kind: string, item: string) =>
    db().from('entitlements').upsert({ user_id: order.user_id, creator_id: order.creator_id, kind, item_id: item, order_id: order.id }, { onConflict: 'user_id,kind,item_id' });

  switch (order.kind) {
    case 'membership': { // lifetime
      const referredBy = await referral(order);
      const r = await upsertMembership({ userId: order.user_id, creatorId: order.creator_id, tierId: order.item_id, period: 'lifetime', status: 'active', periodEnd: null, source: 'purchase', referredBy });
      membershipId = r.membership.id;
      if (r.isNew) await welcome(order.creator_id, order.user_id, order.item_id);
      break;
    }
    case 'course':
      await ent('course', order.item_id);
      await db().from('enrollments').upsert({ course_id: order.item_id, user_id: order.user_id }, { onConflict: 'course_id,user_id' });
      await fireEvent(order.creator_id, 'course_enrolled', { userId: order.user_id, itemId: order.item_id, kind: 'course' });
      link = `${base}/courses`;
      break;
    case 'cohort': {
      const { data: h } = await db().from('cohorts').select('id, course_id').eq('id', order.item_id).single();
      await ent('cohort', h.id);
      await db().from('enrollments').upsert({ course_id: h.course_id, user_id: order.user_id, cohort_id: h.id }, { onConflict: 'course_id,user_id' });
      await fireEvent(order.creator_id, 'course_enrolled', { userId: order.user_id, itemId: h.course_id, kind: 'cohort' });
      link = `${base}/courses`;
      break;
    }
    case 'product':
      await ent('product', order.item_id);
      link = `${base}/shop/${order.item_id}`;
      break;
    case 'merch': {
      await ent('product', order.item_id);
      const { data: p } = await db().from('products').select('stock').eq('id', order.item_id).single();
      if (p?.stock !== null && p?.stock !== undefined) await db().from('products').update({ stock: Math.max(0, p.stock - order.quantity) }).eq('id', order.item_id);
      await db().from('orders').update({ fulfillment_status: 'pending' }).eq('id', order.id);
      link = '/account/orders';
      break;
    }
    case 'ppv':
      await ent('post', order.item_id);
      link = `${base}/posts/${order.item_id}`;
      break;
    case 'event':
      await ent('event', order.item_id);
      link = `${base}/live/${order.item_id}`;
      break;
    case 'booking':
      await confirmBooking(meta.booking_id);
      link = '/account/bookings';
      break;
    case 'gift':
      await db().from('gift_cards').update({ status: 'scheduled' }).eq('order_id', order.id);
      await deliverDueGifts();
      link = '/account/gifts';
      break;
    case 'service':
      await db().from('service_orders').update({ status: 'in_progress', order_id: order.id }).eq('id', order.item_id);
      link = `/studio/${creator.slug}/services`;
      break;
  }

  await recordPayment({
    rzpPaymentId, method, amountPaise: order.total_paise, userId: order.user_id, creatorId: order.creator_id,
    kind: order.kind, orderId: order.id, membershipId, itemId: order.item_id, description: meta.label || order.kind, buyerState: order.buyer_state_code,
  });
  await afterPaidCommon(order);
  await notify({
    userId: order.user_id, creatorId: order.creator_id, kind: 'receipt', transactional: true,
    title: `Payment received — ${meta.label || 'your purchase'}`,
    body: `We received ${inr(order.total_paise)}. Your GST invoice is in your account under Billing.`, link,
  });
  if (!['membership', 'service'].includes(order.kind)) await fireEvent(order.creator_id, 'purchase', { userId: order.user_id, kind: order.kind, itemId: order.item_id });
  return order;
}

/** Called for the authorisation payment and every renewal of a Razorpay subscription. */
export async function handleSubscriptionPayment(sub: any, payment: any | null) {
  const { data: order } = await db().from('orders').select('*').eq('razorpay_subscription_id', sub.id).order('created_at').limit(1).maybeSingle();
  let { data: m } = await db().from('memberships').select('*').eq('razorpay_subscription_id', sub.id).maybeSingle();

  // Tier follows the plan (covers scheduled upgrades/downgrades)
  let tierId = m?.tier_id || order?.item_id;
  const creatorId = m?.creator_id || order?.creator_id;
  const userId = m?.user_id || order?.user_id;
  if (!creatorId || !userId) return;
  const { data: tiers } = await db().from('tiers').select('id, razorpay_plan_ids').eq('creator_id', creatorId);
  for (const t of tiers || []) if (Object.values(t.razorpay_plan_ids || {}).includes(sub.plan_id)) tierId = t.id;

  const periodEnd = sub.current_end ? new Date(sub.current_end * 1000) : sub.start_at ? new Date(sub.start_at * 1000) : null;
  const firstTime = !m || !['active', 'trialing', 'past_due'].includes(m.status) || m.razorpay_subscription_id !== sub.id;
  const isTrial = order && order.total_paise === 0 && firstTime && (order.meta?.trial_days || 0) > 0;

  if (firstTime && order && order.total_paise > 0 && !payment) return; // wait for the captured payment (webhook)

  let referredBy: string | null = null;
  if (firstTime && order) {
    await db().from('orders').update({ status: 'paid', paid_at: new Date().toISOString(), razorpay_payment_id: payment?.id ?? null }).eq('id', order.id).eq('status', 'created');
    referredBy = await referral(order);
    await afterPaidCommon(order);
  }
  const prevTier = m?.tier_id;
  const r = await upsertMembership({
    userId, creatorId, tierId, period: order?.billing_period || m?.billing_period || 'monthly',
    status: isTrial ? 'trialing' : 'active', periodEnd, source: 'purchase', subscriptionId: sub.id, referredBy,
  });
  m = r.membership;

  const chargeAmount = payment?.amount ?? 0;
  const isAuthOnly = isTrial || (firstTime && order && order.total_paise === 0);
  if (payment && !isAuthOnly && chargeAmount > 0) {
    const { data: t } = await db().from('tiers').select('name').eq('id', tierId).single();
    await recordPayment({
      rzpPaymentId: payment.id, method: payment.method, amountPaise: chargeAmount, userId, creatorId, kind: 'membership',
      orderId: firstTime ? order?.id : null, membershipId: m.id, itemId: tierId, description: `Membership — ${t?.name || ''}`.trim(),
      buyerState: order?.buyer_state_code,
    });
  }

  // Retention offer accepted in the cancel flow: refund part of this renewal
  if (payment && !firstTime && chargeAmount > 0 && m.next_charge_discount_pct > 0) {
    const refund = Math.round((chargeAmount * m.next_charge_discount_pct) / 100);
    try {
      const rf = await refundPayment(payment.id, refund, { reason: 'retention_offer' });
      const { data: pay } = await db().from('payments').select('id, refunded_paise').eq('razorpay_payment_id', payment.id).single();
      if (pay) {
        await db().from('refunds').insert({ payment_id: pay.id, amount_paise: refund, reason: 'Retention discount', razorpay_refund_id: rf.id, status: 'processed' });
        await db().from('payments').update({ refunded_paise: pay.refunded_paise + refund, status: 'partially_refunded' }).eq('id', pay.id);
      }
      await db().from('memberships').update({ next_charge_discount_pct: 0 }).eq('id', m.id);
    } catch (e) { console.error('retention refund failed', e); }
  }

  if (r.isNew) await welcome(creatorId, userId, tierId);
  else if (prevTier && prevTier !== tierId) await fireEvent(creatorId, 'tier_changed', { userId, tierId });
  else if (payment && !firstTime) {
    const { data: c } = await db().from('creators').select('slug, name').eq('id', creatorId).single();
    await notify({ userId, creatorId, kind: 'renewal', transactional: true, title: `${c.name} membership renewed`, body: `We charged ${inr(chargeAmount)}. Next renewal on ${fmtDate(periodEnd)}.`, link: '/account/billing' });
  }
}

export async function confirmBooking(bookingId: string) {
  const { data: b } = await db().from('bookings').select('*, type:booking_types(title), creator:creators(name, slug)').eq('id', bookingId).single();
  if (!b || b.status === 'confirmed') return;
  let meetingId: string | null = null, password: string | null = null;
  try {
    const m = await createMeeting({ topic: `${b.type.title} with ${b.creator.name}`, startISO: b.starts_at, durationMin: Math.round((+new Date(b.ends_at) - +new Date(b.starts_at)) / 60000), record: false });
    meetingId = m.id; password = m.password;
  } catch (e) {
    console.error('Zoom meeting for booking failed', e);
  }
  await db().from('bookings').update({ status: 'confirmed', zoom_meeting_id: meetingId, zoom_password: password }).eq('id', bookingId);
  await notify({
    userId: b.user_id, creatorId: b.creator_id, kind: 'booking', transactional: true, whatsapp: true,
    title: `Booked: ${b.type.title} on ${fmtDate(b.starts_at, true)}`,
    body: 'Your 1:1 session is confirmed. Join from your bookings page at the scheduled time.', link: '/account/bookings',
  });
  const { data: team } = await db().from('creator_team').select('user_id').eq('creator_id', b.creator_id).in('role', ['owner']);
  for (const t of team || []) await notify({ userId: t.user_id, creatorId: b.creator_id, kind: 'booking', title: `New 1:1 booking: ${fmtDate(b.starts_at, true)}`, body: b.type.title, link: `/studio/${b.creator.slug}/bookings` });
}

/** Send gift emails whose delivery date has arrived. */
export async function deliverDueGifts() {
  const { data: gifts } = await db().from('gift_cards').select('*, creator:creators(name, slug, theme), tier:tiers(name), purchaser:profiles!gift_cards_purchaser_id_fkey(full_name)')
    .eq('status', 'scheduled').lte('deliver_at', new Date().toISOString()).limit(100);
  for (const g of gifts || []) {
    const what = g.kind === 'credit' ? `${inr(g.amount_paise)} credit` : `${g.months} month${g.months > 1 ? 's' : ''} of ${g.tier?.name}`;
    await sendEmail({
      to: g.recipient_email, subject: `🎁 ${g.purchaser?.full_name || 'Someone'} sent you a gift from ${g.creator.name}`, creatorId: g.creator_id, template: 'gift',
      html: layout({
        title: `You've received a gift${g.occasion ? ` for ${g.occasion}` : ''}!`,
        body: `Hi ${g.recipient_name || 'there'},\n\n${g.purchaser?.full_name || 'A friend'} gifted you ${what} at ${g.creator.name}.${g.message ? `\n\n"${g.message}"` : ''}\n\nYour gift code: ${g.code}`,
        cta: { label: 'Redeem your gift', url: `${APP_URL}/gift/redeem?code=${g.code}` }, brand: g.creator.name, accent: g.creator.theme?.accent,
      }),
    });
    await db().from('gift_cards').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', g.id);
  }
}

export async function redeemGift(code: string, userId: string) {
  const { data: g } = await db().from('gift_cards').select('*, creator:creators(slug)').eq('code', code.trim().toUpperCase()).maybeSingle();
  if (!g || !['scheduled', 'delivered'].includes(g.status)) throw new Error('This gift code is invalid or already used');
  const { data: claimed } = await db().from('gift_cards').update({ status: 'redeemed', redeemed_by: userId, redeemed_at: new Date().toISOString() })
    .eq('id', g.id).in('status', ['scheduled', 'delivered']).select('id');
  if (!claimed?.length) throw new Error('This gift was just redeemed');

  if (g.kind === 'credit') {
    const { data: p } = await db().from('profiles').select('credit_paise').eq('id', userId).single();
    await db().from('profiles').update({ credit_paise: (p?.credit_paise || 0) + g.amount_paise }).eq('id', userId);
    return { redirect: '/account', message: `${inr(g.amount_paise)} added to your credit` };
  }
  const { data: m } = await db().from('memberships').select('*').eq('user_id', userId).eq('creator_id', g.creator_id).maybeSingle();
  const active = m && ['active', 'trialing', 'past_due'].includes(m.status);
  if (active && m.razorpay_subscription_id) {
    // Already paying: gift becomes store credit equal to its value instead of double-billing
    const { data: o } = await db().from('orders').select('total_paise').eq('id', g.order_id).single();
    const { data: p } = await db().from('profiles').select('credit_paise').eq('id', userId).single();
    await db().from('profiles').update({ credit_paise: (p?.credit_paise || 0) + (o?.total_paise || 0) }).eq('id', userId);
    return { redirect: `/${g.creator.slug}`, message: 'You already have an active subscription, so the gift was added as credit' };
  }
  const startFrom = active && m.current_period_end && new Date(m.current_period_end) > new Date() ? new Date(m.current_period_end) : new Date();
  await upsertMembership({ userId, creatorId: g.creator_id, tierId: g.tier_id, period: 'monthly', status: 'active', periodEnd: addMonths(startFrom, g.months), source: 'gift' });
  if (!active) await welcome(g.creator_id, userId, g.tier_id);
  return { redirect: `/${g.creator.slug}`, message: 'Gift redeemed — enjoy your membership!' };
}

/** Grant a free/comp membership (team action or import). */
export async function compMembership(userId: string, creatorId: string, tierId: string, months: number | null, source: 'comp' | 'import' = 'comp') {
  const r = await upsertMembership({ userId, creatorId, tierId, period: months ? 'monthly' : 'lifetime', status: 'active', periodEnd: months ? addMonths(new Date(), months) : null, source });
  if (r.isNew) await welcome(creatorId, userId, tierId);
  return r.membership;
}

export { PERIOD_MONTHS };
