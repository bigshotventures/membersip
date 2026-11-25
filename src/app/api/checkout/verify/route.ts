import { NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { fetchPayment, rzp, verifyCheckoutSignature } from '@/lib/razorpay';
import { handleOrderPaid, handleSubscriptionPayment } from '@/lib/fulfillment';

export async function POST(req: Request) {
  const user = await getProfile();
  if (!user) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  const b = await req.json();
  const { data: order } = await admin().from('orders').select('*').eq('id', b.orderId).eq('user_id', user.id).single();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const ok = verifyCheckoutSignature({
    orderId: order.razorpay_order_id || undefined, subscriptionId: order.razorpay_subscription_id || undefined,
    paymentId: b.razorpay_payment_id, signature: b.razorpay_signature,
  });
  if (!ok) return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 });

  const payment = await fetchPayment(b.razorpay_payment_id);
  if (order.razorpay_subscription_id) {
    const sub = await rzp(`/subscriptions/${order.razorpay_subscription_id}`);
    await handleSubscriptionPayment(sub, payment.status === 'captured' ? payment : null);
    return NextResponse.json({ ok: true });
  }
  if (payment.status === 'captured') {
    await handleOrderPaid(order.id, payment.id, payment.method);
    return NextResponse.json({ ok: true });
  }
  // authorized but not yet captured — the webhook will finish fulfilment
  return NextResponse.json({ ok: true, pending: true });
}
