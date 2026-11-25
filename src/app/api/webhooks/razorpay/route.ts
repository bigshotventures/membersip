import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { rzp, verifyWebhook } from '@/lib/razorpay';
import { handleOrderPaid, handleSubscriptionPayment } from '@/lib/fulfillment';
import { notify } from '@/lib/notify';
import { fireEvent } from '@/lib/events';
import { sendWhatsApp } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get('x-razorpay-signature'))) return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  const evt = JSON.parse(raw);
  const db = admin();
  const payment = evt.payload?.payment?.entity;
  const sub = evt.payload?.subscription?.entity;

  try {
    switch (evt.event) {
      case 'payment.captured':
      case 'order.paid': {
        if (payment?.order_id) {
          const { data: order } = await db.from('orders').select('id').eq('razorpay_order_id', payment.order_id).maybeSingle();
          if (order) { await handleOrderPaid(order.id, payment.id, payment.method); break; }
        }
        if (payment?.invoice_id) {
          const inv = await rzp(`/invoices/${payment.invoice_id}`);
          if (inv.subscription_id) await handleSubscriptionPayment(await rzp(`/subscriptions/${inv.subscription_id}`), payment);
        }
        break;
      }
      case 'subscription.authenticated':
      case 'subscription.activated':
        if (sub) await handleSubscriptionPayment(sub, null);
        break;
      case 'subscription.charged':
        if (sub) await handleSubscriptionPayment(sub, payment);
        break;
      case 'subscription.pending': { // renewal failed, Razorpay is retrying
        const { data: m } = await db.from('memberships').select('*, creator:creators(name, slug)').eq('razorpay_subscription_id', sub.id).maybeSingle();
        if (!m) break;
        await db.from('memberships').update({ status: 'past_due', failed_attempts: m.failed_attempts + 1, last_dunning_at: new Date().toISOString() }).eq('id', m.id);
        await notify({
          userId: m.user_id, creatorId: m.creator_id, kind: 'payment_failed', transactional: true, whatsapp: true,
          title: `Payment failed for your ${m.creator.name} membership`,
          body: 'We could not renew your membership. Please make sure your UPI Autopay mandate or card is active — we will retry automatically. You can also update your payment method from Billing.',
          link: sub.short_url || '/account/billing',
        });
        await fireEvent(m.creator_id, 'payment_failed', { userId: m.user_id, tierId: m.tier_id });
        break;
      }
      case 'subscription.halted': { // retries exhausted
        const { data: m } = await db.from('memberships').select('*, creator:creators(name, slug)').eq('razorpay_subscription_id', sub.id).maybeSingle();
        if (!m) break;
        await db.from('memberships').update({ status: 'expired', cancelled_at: new Date().toISOString() }).eq('id', m.id);
        await notify({ userId: m.user_id, creatorId: m.creator_id, kind: 'expired', transactional: true, whatsapp: true,
          title: `Your ${m.creator.name} membership has ended`, body: 'We could not collect your renewal after several attempts. Rejoin anytime to restore access.', link: `/${m.creator.slug}` });
        await fireEvent(m.creator_id, 'member_cancelled', { userId: m.user_id, tierId: m.tier_id });
        break;
      }
      case 'subscription.cancelled':
        await db.from('memberships').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('razorpay_subscription_id', sub.id).neq('status', 'expired');
        break;
      case 'subscription.completed':
        await db.from('memberships').update({ status: 'expired' }).eq('razorpay_subscription_id', sub.id);
        break;
      case 'subscription.paused':
        await db.from('memberships').update({ status: 'paused' }).eq('razorpay_subscription_id', sub.id);
        break;
      case 'subscription.resumed':
        await db.from('memberships').update({ status: 'active', paused_until: null }).eq('razorpay_subscription_id', sub.id);
        break;
      case 'refund.processed': {
        const refund = evt.payload.refund.entity;
        await db.from('refunds').update({ status: 'processed' }).eq('razorpay_refund_id', refund.id);
        break;
      }
      case 'payment.failed': {
        if (payment?.order_id) {
          const { data: order } = await db.from('orders').select('*').eq('razorpay_order_id', payment.order_id).maybeSingle();
          if (order?.status === 'created') {
            await db.from('orders').update({ status: 'failed' }).eq('id', order.id);
            if (order.meta?.booking_id) await db.from('bookings').update({ status: 'cancelled' }).eq('id', order.meta.booking_id).eq('status', 'pending_payment');
          }
        }
        break;
      }
    }
  } catch (e: any) {
    console.error('razorpay webhook error', evt.event, e);
    return NextResponse.json({ error: e.message }, { status: 500 }); // Razorpay retries
  }
  return NextResponse.json({ ok: true });
}
