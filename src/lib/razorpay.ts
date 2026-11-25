import 'server-only';
import crypto from 'crypto';

const BASE = 'https://api.razorpay.com/v1';

function auth() {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error('Razorpay keys are not configured');
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

export async function rzp<T = any>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: any): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay: ${json?.error?.description || res.statusText}`);
  return json;
}

export function createOrder(amountPaise: number, receipt: string, notes: Record<string, string> = {}) {
  return rzp('/orders', 'POST', { amount: amountPaise, currency: 'INR', receipt: receipt.slice(0, 40), notes });
}

const PERIOD: Record<string, { period: string; interval: number }> = {
  monthly: { period: 'monthly', interval: 1 },
  quarterly: { period: 'monthly', interval: 3 },
  yearly: { period: 'yearly', interval: 1 },
};

export async function createPlan(name: string, amountPaise: number, billing: string) {
  const p = PERIOD[billing];
  return rzp('/plans', 'POST', { period: p.period, interval: p.interval, item: { name: name.slice(0, 60), amount: amountPaise, currency: 'INR' } });
}

/**
 * Subscription whose first charge is taken up front as an "addon" on the authorisation payment
 * (lets us apply coupons/credit to the first period) and recurring billing starts after the first period/trial.
 */
export function createSubscription(opts: {
  planId: string; startAt: Date; upfrontPaise: number; upfrontLabel: string; totalCount: number; notes: Record<string, string>; notifyEmail?: string; notifyPhone?: string;
}) {
  return rzp('/subscriptions', 'POST', {
    plan_id: opts.planId,
    total_count: opts.totalCount,
    quantity: 1,
    customer_notify: 1,
    start_at: Math.floor(opts.startAt.getTime() / 1000),
    addons: opts.upfrontPaise > 0 ? [{ item: { name: opts.upfrontLabel.slice(0, 60), amount: opts.upfrontPaise, currency: 'INR' } }] : undefined,
    notes: opts.notes,
    notify_info: opts.notifyEmail || opts.notifyPhone ? { notify_email: opts.notifyEmail, notify_phone: opts.notifyPhone } : undefined,
  });
}

export const cancelSubscription = (id: string, atCycleEnd = true) =>
  rzp(`/subscriptions/${id}/cancel`, 'POST', { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
export const pauseSubscription = (id: string) => rzp(`/subscriptions/${id}/pause`, 'POST', { pause_at: 'now' });
export const resumeSubscription = (id: string) => rzp(`/subscriptions/${id}/resume`, 'POST', { resume_at: 'now' });
export const changeSubscriptionPlan = (id: string, planId: string) =>
  rzp(`/subscriptions/${id}`, 'PATCH', { plan_id: planId, schedule_change_at: 'cycle_end', quantity: 1 });
export const refundPayment = (paymentId: string, amountPaise: number, notes: Record<string, string> = {}) =>
  rzp(`/payments/${paymentId}/refund`, 'POST', { amount: amountPaise, speed: 'normal', notes });
export const fetchPayment = (id: string) => rzp(`/payments/${id}`);

export function verifyCheckoutSignature(p: { orderId?: string; subscriptionId?: string; paymentId: string; signature: string }) {
  const payload = p.orderId ? `${p.orderId}|${p.paymentId}` : `${p.paymentId}|${p.subscriptionId}`;
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(payload).digest('hex');
  return safeEqual(expected, p.signature);
}

export function verifyWebhook(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
