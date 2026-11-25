'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { admin } from '@/lib/supabase/admin';
import { requireProfile } from '@/lib/auth';
import { cancelSubscription, changeSubscriptionPlan, pauseSubscription, resumeSubscription } from '@/lib/razorpay';
import { ensurePlan } from '@/lib/plans';
import { fireEvent } from '@/lib/events';
import { notify } from '@/lib/notify';
import { addMonths, fmtDate, int, str, strOrNull } from '@/lib/utils';

async function ownMembership(id: string) {
  const p = await requireProfile('/account/billing');
  const { data: m } = await admin().from('memberships').select('*, creator:creators(id, slug, name, settings), tier:tiers!memberships_tier_id_fkey(*)').eq('id', id).eq('user_id', p.id).single();
  if (!m) throw new Error('Membership not found');
  return { p, m };
}

export async function cancelMembership(fd: FormData) {
  const { p, m } = await ownMembership(str(fd, 'membership_id'));
  const reason = str(fd, 'reason') || 'other';
  if (m.razorpay_subscription_id) await cancelSubscription(m.razorpay_subscription_id, true);
  await admin().from('memberships').update({ cancel_at_period_end: true, cancelled_at: new Date().toISOString(), ...(m.razorpay_subscription_id ? {} : { status: 'cancelled' }) }).eq('id', m.id);
  await admin().from('cancel_feedback').insert({ membership_id: m.id, user_id: p.id, creator_id: m.creator_id, reason, details: strOrNull(fd, 'details'), outcome: 'cancelled' });
  await fireEvent(m.creator_id, 'member_cancelled', { userId: p.id, tierId: m.tier_id });
  await notify({ userId: p.id, creatorId: m.creator_id, kind: 'cancelled', transactional: true, title: `Your ${m.creator.name} membership is cancelled`, body: `You keep access until ${fmtDate(m.current_period_end)}. You can rejoin anytime.`, link: `/${m.creator.slug}` });
  revalidatePath('/account/billing');
  redirect('/account/billing?notice=' + encodeURIComponent('Membership cancelled. Access continues until the end of your billing period.'));
}

export async function acceptRetentionOffer(fd: FormData) {
  const { p, m } = await ownMembership(str(fd, 'membership_id'));
  const offer = str(fd, 'offer');
  const reason = str(fd, 'reason') || 'other';
  const db = admin();
  if (offer === 'pause') {
    const months = Math.min(Math.max(int(fd, 'months', 1), 1), m.creator.settings?.pause_max_months || 3);
    if (!m.razorpay_subscription_id) throw new Error('Only recurring memberships can be paused');
    await pauseSubscription(m.razorpay_subscription_id);
    await db.from('memberships').update({ status: 'paused', paused_until: addMonths(new Date(), months).toISOString() }).eq('id', m.id);
    await db.from('cancel_feedback').insert({ membership_id: m.id, user_id: p.id, creator_id: m.creator_id, reason, outcome: 'paused', details: `${months} months` });
  } else if (offer === 'discount') {
    const pct = Math.min(Number(m.creator.settings?.cancel_offer_pct) || 20, 90);
    await db.from('memberships').update({ next_charge_discount_pct: pct }).eq('id', m.id);
    await db.from('cancel_feedback').insert({ membership_id: m.id, user_id: p.id, creator_id: m.creator_id, reason, outcome: 'discount', details: `${pct}%` });
  } else if (offer === 'downgrade') {
    const tierId = str(fd, 'tier_id');
    await scheduleTierChange(m, tierId);
    await db.from('cancel_feedback').insert({ membership_id: m.id, user_id: p.id, creator_id: m.creator_id, reason, outcome: 'downgraded' });
  }
  revalidatePath('/account/billing');
  redirect('/account/billing?notice=' + encodeURIComponent('Thanks for staying! Your membership has been updated.'));
}

async function scheduleTierChange(m: any, tierId: string) {
  const { data: t } = await admin().from('tiers').select('*').eq('id', tierId).eq('creator_id', m.creator_id).eq('is_active', true).single();
  if (!t) throw new Error('Tier not available');
  if (!m.razorpay_subscription_id) throw new Error('Plan changes are available on recurring memberships. Buy the new tier from the creator page.');
  const planId = await ensurePlan(t, m.billing_period);
  await changeSubscriptionPlan(m.razorpay_subscription_id, planId);
  await admin().from('memberships').update({ pending_tier_id: t.id }).eq('id', m.id);
}

export async function changeTier(fd: FormData) {
  const { m } = await ownMembership(str(fd, 'membership_id'));
  try {
    await scheduleTierChange(m, str(fd, 'tier_id'));
  } catch (e: any) {
    redirect('/account/billing?error=' + encodeURIComponent(e.message));
  }
  revalidatePath('/account/billing');
  redirect('/account/billing?notice=' + encodeURIComponent('Your plan will switch at your next renewal.'));
}

export async function resumeMembership(fd: FormData) {
  const { m } = await ownMembership(str(fd, 'membership_id'));
  if (m.status === 'paused' && m.razorpay_subscription_id) {
    await resumeSubscription(m.razorpay_subscription_id);
    await admin().from('memberships').update({ status: 'active', paused_until: null }).eq('id', m.id);
  }
  revalidatePath('/account/billing');
  redirect('/account/billing?notice=' + encodeURIComponent('Welcome back! Your membership is active again.'));
}
