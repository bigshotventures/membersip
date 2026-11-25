import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { createPlan } from '@/lib/razorpay';
import { getSettings, grossUp } from '@/lib/money';

/** Razorpay plan for a tier + billing period at the current price. Cached on the tier as "period:amount" → plan_id. */
export async function ensurePlan(tier: any, period: string): Promise<string> {
  const s = await getSettings();
  const price = tier[`price_${period}`];
  if (!price) throw new Error('This billing period is not offered');
  const amount = grossUp(price, s);
  const key = `${period}:${amount}`;
  const plans = tier.razorpay_plan_ids || {};
  if (plans[key]) return plans[key];
  const { data: c } = await admin().from('creators').select('name').eq('id', tier.creator_id).single();
  const plan = await createPlan(`${c?.name} – ${tier.name} (${period})`, amount, period);
  await admin().from('tiers').update({ razorpay_plan_ids: { ...plans, [key]: plan.id } }).eq('id', tier.id);
  return plan.id;
}
