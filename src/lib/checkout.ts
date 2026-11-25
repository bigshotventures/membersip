import 'server-only';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase/admin';
import { getMembership, Profile } from '@/lib/auth';
import { quote, Kind } from '@/lib/pricing';
import { ensurePlan } from '@/lib/plans';
import { createOrder, createSubscription } from '@/lib/razorpay';
import { handleOrderPaid } from '@/lib/fulfillment';
import { availableSlots } from '@/lib/slots';
import { variantFor, visitorId } from '@/lib/ab';
import { PERIOD_MONTHS, addMonths } from '@/lib/utils';

export type CheckoutBody = {
  creatorId: string; kind: Kind; itemId: string; period?: string; coupon?: string; useCredit?: boolean; stateCode?: string;
  shipping?: { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
  gift?: { kind: 'membership' | 'credit'; months?: number; amountPaise?: number; recipientEmail: string; recipientName?: string; message?: string; occasion?: string; deliverAt?: string };
  bookingStart?: string; bookingNotes?: string; abTestId?: string;
};

export function successPath(slug: string, kind: string, itemId: string) {
  switch (kind) {
    case 'membership': return `/${slug}?welcome=1`;
    case 'course': case 'cohort': return `/${slug}/courses`;
    case 'product': return `/${slug}/shop/${itemId}?purchased=1`;
    case 'merch': return `/account/orders`;
    case 'ppv': return `/${slug}/posts/${itemId}`;
    case 'event': return `/${slug}/live/${itemId}`;
    case 'booking': return `/account/bookings`;
    case 'gift': return `/account/gifts?sent=1`;
    case 'service': return `/studio/${slug}/services`;
    default: return `/${slug}`;
  }
}

export async function startCheckout(user: Profile, b: CheckoutBody) {
  const db = admin();
  const { data: creator } = await db.from('creators').select('id, slug, name, status').eq('id', b.creatorId).single();
  if (!creator || creator.status === 'suspended') throw new Error('This creator is not accepting payments right now');
  if (creator.status !== 'live' && b.kind !== 'service') throw new Error('Checkout opens when this creator launches');
  const { data: ban } = await db.from('member_restrictions').select('kind').eq('creator_id', creator.id).eq('user_id', user.id).eq('kind', 'banned').maybeSingle();
  if (ban) throw new Error('You cannot make purchases from this creator');

  let kind: string = b.kind;
  if (b.kind === 'membership') {
    const m = await getMembership(creator.id, user.id);
    if (m?.hasAccess && m.razorpay_subscription_id && !m.cancel_at_period_end) throw new Error('You already have an active membership. Change your plan from Account → Billing.');
  }
  const q = await quote({
    creatorId: creator.id, kind: b.kind, itemId: b.itemId, period: b.period, coupon: b.coupon, userId: user.id, useCredit: b.useCredit,
    months: b.gift?.months, giftKind: b.gift?.kind, amountPaise: b.gift?.amountPaise,
  });
  if (b.coupon && q.couponError) throw new Error(q.couponError);
  if (b.kind === 'product' && q.item.kind === 'merch') kind = 'merch';
  if (kind === 'merch' && (!b.shipping?.line1 || !b.shipping?.pincode || !/^\d{6}$/.test(b.shipping.pincode))) throw new Error('Please enter a valid shipping address');

  let ab: any = null;
  if (b.abTestId) {
    const { data: test } = await db.from('ab_tests').select('id, variants').eq('id', b.abTestId).eq('creator_id', creator.id).maybeSingle();
    if (test) {
      ab = { test_id: test.id, variant: variantFor(test).key, visitor_id: visitorId() };
      await db.from('ab_events').insert({ test_id: test.id, variant: ab.variant, visitor_id: ab.visitor_id, event: 'checkout' });
    }
  }
  const ref = cookies().get('ref')?.value || null;

  // 1:1 booking: hold the slot
  let bookingId: string | null = null;
  if (kind === 'booking') {
    if (!b.bookingStart) throw new Error('Pick a time slot');
    const days = await availableSlots(b.itemId);
    const ok = days.some((d) => d.slots.includes(new Date(b.bookingStart!).toISOString()));
    if (!ok) throw new Error('That slot was just taken — please pick another');
    const start = new Date(b.bookingStart);
    await db.from('bookings').update({ status: 'cancelled' }).eq('creator_id', creator.id).eq('starts_at', start.toISOString())
      .eq('status', 'pending_payment').lt('created_at', new Date(Date.now() - 15 * 60000).toISOString());
    const { data: bk, error } = await db.from('bookings').insert({
      booking_type_id: b.itemId, creator_id: creator.id, user_id: user.id, starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + q.item.duration_min * 60000).toISOString(), notes: b.bookingNotes?.slice(0, 1000) || null,
    }).select('id').single();
    if (error) throw new Error('That slot was just taken — please pick another');
    bookingId = bk.id;
  }

  const { data: order, error: oe } = await db.from('orders').insert({
    user_id: user.id, creator_id: creator.id, kind, item_id: b.kind === 'gift' && b.gift?.kind === 'credit' ? null : b.itemId,
    billing_period: b.kind === 'membership' ? b.period || 'monthly' : null,
    subtotal_paise: q.subtotal, discount_paise: q.discount, credit_used_paise: q.credit, total_paise: q.total, coupon_id: q.couponId,
    buyer_state_code: b.stateCode || user.state_code || null, shipping_address: kind === 'merch' ? b.shipping : null,
    ab_variant: ab, referral_code: ref, meta: { label: q.label, trial_days: q.trialDays, booking_id: bookingId },
  }).select('*').single();
  if (oe) throw oe;
  if (bookingId) await db.from('bookings').update({ order_id: order.id }).eq('id', bookingId);
  if (b.stateCode && !user.state_code) await db.from('profiles').update({ state_code: b.stateCode }).eq('id', user.id);

  if (b.kind === 'gift') {
    const g = b.gift!;
    if (!g.recipientEmail || !/^\S+@\S+\.\S+$/.test(g.recipientEmail)) throw new Error('Enter the recipient’s email');
    await db.from('gift_cards').insert({
      creator_id: creator.id, kind: g.kind, tier_id: g.kind === 'membership' ? b.itemId : null, months: g.kind === 'membership' ? q.item.months : null,
      amount_paise: g.kind === 'credit' ? q.total : null, purchaser_id: user.id, recipient_email: g.recipientEmail, recipient_name: g.recipientName || null,
      message: g.message?.slice(0, 500) || null, occasion: g.occasion || null, deliver_at: g.deliverAt ? new Date(g.deliverAt).toISOString() : new Date().toISOString(), order_id: order.id,
    });
  }
  const redirect = successPath(creator.slug, kind, b.itemId);
  const prefill = { name: user.full_name || '', email: user.email || '', contact: user.phone || '' };

  if (q.recurring) {
    const { data: tier } = await db.from('tiers').select('*').eq('id', b.itemId).single();
    const period = b.period || 'monthly';
    const planId = await ensurePlan(tier, period);
    const startAt = q.trialDays > 0 ? new Date(Date.now() + q.trialDays * 86400000) : addMonths(new Date(), PERIOD_MONTHS[period]);
    const sub = await createSubscription({
      planId, startAt, upfrontPaise: q.trialDays > 0 ? 0 : q.total, upfrontLabel: `First ${period === 'monthly' ? 'month' : period === 'quarterly' ? 'quarter' : 'year'}`,
      totalCount: period === 'monthly' ? 120 : period === 'quarterly' ? 40 : 10,
      notes: { order_id: order.id, user_id: user.id, creator_id: creator.id }, notifyEmail: user.email || undefined, notifyPhone: user.phone || undefined,
    });
    await db.from('orders').update({ razorpay_subscription_id: sub.id, ...(q.trialDays > 0 ? { total_paise: 0 } : {}) }).eq('id', order.id);
    return { mode: 'subscription' as const, orderId: order.id, subscriptionId: sub.id, key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, name: creator.name, description: q.label, prefill, redirect };
  }

  if (q.total === 0) {
    await handleOrderPaid(order.id, `free_${order.id}`, 'free');
    return { mode: 'free' as const, orderId: order.id, redirect };
  }
  const ro = await createOrder(q.total, order.id, { order_id: order.id, creator: creator.slug });
  await db.from('orders').update({ razorpay_order_id: ro.id }).eq('id', order.id);
  return { mode: 'order' as const, orderId: order.id, razorpayOrderId: ro.id, amount: q.total, key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, name: creator.name, description: q.label, prefill, redirect };
}
