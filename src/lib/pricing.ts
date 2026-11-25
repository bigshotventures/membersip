import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { getSettings, grossUp } from '@/lib/money';
import { getMembership } from '@/lib/auth';

export type Kind = 'membership' | 'course' | 'cohort' | 'product' | 'merch' | 'ppv' | 'event' | 'booking' | 'gift' | 'service';

export type QuoteInput = {
  creatorId: string; kind: Kind; itemId: string; period?: string | null; coupon?: string | null;
  userId: string; useCredit?: boolean; months?: number; giftKind?: 'membership' | 'credit'; amountPaise?: number;
};

export type Quote = {
  label: string; subtotal: number; discount: number; credit: number; total: number;
  couponId: string | null; couponError?: string; trialDays: number; recurring: boolean; item: any;
};

const COUPON_SCOPE: Record<string, string> = {
  membership: 'membership', course: 'course', cohort: 'course', product: 'product', merch: 'product',
  ppv: 'any', event: 'event', booking: 'booking', gift: 'membership',
};

export async function quote(q: QuoteInput): Promise<Quote> {
  const db = admin();
  const s = await getSettings();
  let label = '', price = 0, trialDays = 0, recurring = false, item: any = null;

  switch (q.kind) {
    case 'membership': {
      const { data: t } = await db.from('tiers').select('*').eq('id', q.itemId).eq('creator_id', q.creatorId).eq('is_active', true).single();
      if (!t) throw new Error('This tier is not available');
      const period = q.period || 'monthly';
      price = t[`price_${period}`];
      if (price === null || price === undefined) throw new Error('This billing period is not offered');
      label = `${t.name} — ${period}`;
      recurring = period !== 'lifetime';
      const existing = await getMembership(q.creatorId, q.userId);
      trialDays = recurring && !existing ? t.trial_days : 0; // trials only for first-time members
      item = t;
      break;
    }
    case 'course': {
      const { data: c } = await db.from('courses').select('*').eq('id', q.itemId).eq('creator_id', q.creatorId).eq('status', 'published').single();
      if (!c || c.price_paise === null) throw new Error('This course is not sold separately');
      price = c.price_paise; label = c.title; item = c; break;
    }
    case 'cohort': {
      const { data: h } = await db.from('cohorts').select('*, course:courses(*)').eq('id', q.itemId).single();
      if (!h || h.course.creator_id !== q.creatorId) throw new Error('Cohort not found');
      if (h.enroll_closes_at && new Date(h.enroll_closes_at) < new Date()) throw new Error('Enrolment for this batch has closed');
      if (h.capacity) {
        const { count } = await db.from('enrollments').select('id', { count: 'exact', head: true }).eq('cohort_id', h.id);
        if ((count || 0) >= h.capacity) throw new Error('This batch is full');
      }
      price = h.price_paise ?? h.course.price_paise ?? 0; label = `${h.course.title} — ${h.name}`; item = h; break;
    }
    case 'product':
    case 'merch': {
      const { data: p } = await db.from('products').select('*').eq('id', q.itemId).eq('creator_id', q.creatorId).eq('active', true).single();
      if (!p) throw new Error('Product not found');
      if (p.stock !== null && p.stock <= 0) throw new Error('Out of stock');
      price = p.price_paise; label = p.title; item = p;
      if (p.kind === 'merch') {
        const m = await getMembership(q.creatorId, q.userId);
        if (p.eligible_tier_ids?.length && (!m?.hasAccess || !p.eligible_tier_ids.includes(m.tier_id))) throw new Error('This item is for selected tiers only');
        if (m?.hasAccess && m.tier?.merch_discount_pct) price = Math.round(price * (100 - m.tier.merch_discount_pct) / 100);
      }
      break;
    }
    case 'ppv': {
      const { data: p } = await db.from('posts').select('*').eq('id', q.itemId).eq('creator_id', q.creatorId).eq('visibility', 'ppv').single();
      if (!p || !p.ppv_price_paise) throw new Error('Post not found');
      const m = await getMembership(q.creatorId, q.userId);
      if (!m?.hasAccess) throw new Error('Join the membership to unlock premium drops');
      price = p.ppv_price_paise; label = `Unlock: ${p.title}`; item = p; break;
    }
    case 'event': {
      const { data: e } = await db.from('live_sessions').select('*').eq('id', q.itemId).eq('creator_id', q.creatorId).single();
      if (!e || !e.ticket_price_paise) throw new Error('Event not found');
      price = e.ticket_price_paise; label = `Ticket: ${e.title}`; item = e; break;
    }
    case 'booking': {
      const { data: b } = await db.from('booking_types').select('*').eq('id', q.itemId).eq('creator_id', q.creatorId).eq('active', true).single();
      if (!b) throw new Error('Session type not found');
      price = b.price_paise; label = `1:1 — ${b.title}`; item = b; break;
    }
    case 'gift': {
      if (q.giftKind === 'credit') {
        price = Math.max(10000, Math.min(q.amountPaise || 0, 10000000)); label = 'Gift card'; item = { kind: 'credit' };
      } else {
        const { data: t } = await db.from('tiers').select('*').eq('id', q.itemId).eq('creator_id', q.creatorId).single();
        if (!t?.price_monthly) throw new Error('This tier cannot be gifted');
        const months = [1, 3, 6, 12].includes(q.months || 0) ? q.months! : 1;
        price = months === 12 && t.price_yearly ? t.price_yearly : months === 3 && t.price_quarterly ? t.price_quarterly : t.price_monthly * months;
        label = `Gift: ${t.name} × ${months} month${months > 1 ? 's' : ''}`; item = { ...t, months };
      }
      break;
    }
    case 'service': {
      const { data: so } = await db.from('service_orders').select('*, pkg:service_packages(title)').eq('id', q.itemId).eq('creator_id', q.creatorId).single();
      if (!so) throw new Error('Service order not found');
      price = so.price_paise; label = so.pkg.title; item = so; break;
    }
  }

  const subtotal = grossUp(price, s);
  let discount = 0, couponId: string | null = null, couponError: string | undefined;

  if (q.coupon && q.kind !== 'service') {
    const { data: c } = await db.from('coupons').select('*').eq('creator_id', q.creatorId).ilike('code', q.coupon.trim()).maybeSingle();
    const scope = COUPON_SCOPE[q.kind];
    if (!c || !c.active) couponError = 'Invalid coupon';
    else if (c.expires_at && new Date(c.expires_at) < new Date()) couponError = 'This coupon has expired';
    else if (c.max_redemptions && c.redeemed_count >= c.max_redemptions) couponError = 'This coupon has been fully used';
    else if (c.applies_to !== 'any' && c.applies_to !== scope) couponError = 'This coupon does not apply here';
    else if (c.applies_ids?.length && !c.applies_ids.includes(q.itemId)) couponError = 'This coupon does not apply to this item';
    else {
      discount = c.kind === 'percent' ? Math.round((subtotal * Math.min(c.value, 100)) / 100) : Math.min(c.value, subtotal);
      couponId = c.id;
    }
  }

  let credit = 0;
  if (q.useCredit && q.kind !== 'gift') {
    const { data: p } = await db.from('profiles').select('credit_paise').eq('id', q.userId).single();
    credit = Math.min(p?.credit_paise || 0, subtotal - discount);
  }
  const total = Math.max(0, subtotal - discount - credit);
  // Razorpay minimum charge is ₹1; anything smaller becomes free
  return { label, subtotal, discount, credit, total: total < 100 ? 0 : total, couponId, couponError, trialDays, recurring, item };
}
