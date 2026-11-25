'use client';
import { useEffect, useState } from 'react';
import { inr } from '@/lib/utils';
import { GST_STATES } from '@/lib/states';

declare global { interface Window { Razorpay: any } }

type Q = { label: string; subtotal: number; discount: number; credit: number; total: number; couponError?: string; trialDays: number; recurring: boolean };

function loadScript() {
  return new Promise<boolean>((res) => {
    if (window.Razorpay) return res(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => res(true); s.onerror = () => res(false);
    document.body.appendChild(s);
  });
}

export function Checkout(props: {
  creatorId: string; kind: string; itemId: string; period?: string; initial: Q; availableCredit: number; defaultState?: string | null;
  shipping?: boolean; gift?: { kind: 'membership' | 'credit'; months?: number; amountPaise?: number }; bookingStart?: string; abTestId?: string; accent?: string;
}) {
  const [q, setQ] = useState<Q>(props.initial);
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState('');
  const [useCredit, setUseCredit] = useState(false);
  const [state, setState] = useState(props.defaultState || '');
  const [ship, setShip] = useState({ name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' });
  const [gift, setGift] = useState({ recipientEmail: '', recipientName: '', message: '', occasion: '', deliverAt: '' });
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const base = { creatorId: props.creatorId, kind: props.kind, itemId: props.itemId, period: props.period, gift: props.gift };

  async function requote(c: string, credit: boolean) {
    const r = await fetch('/api/checkout/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, coupon: c, useCredit: credit }) });
    const j = await r.json();
    if (r.ok) { setQ(j); setErr(j.couponError || ''); if (!j.couponError) setApplied(c); else setApplied(''); }
    else setErr(j.error);
  }
  useEffect(() => { if (useCredit || applied) requote(applied, useCredit); /* eslint-disable-next-line */ }, [useCredit]);

  async function pay() {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...base, coupon: applied || undefined, useCredit, stateCode: state || undefined, abTestId: props.abTestId,
          shipping: props.shipping ? ship : undefined, gift: props.gift ? { ...props.gift, ...gift } : undefined,
          bookingStart: props.bookingStart, bookingNotes: notes || undefined,
        }),
      });
      const j = await r.json();
      if (r.status === 401) { window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
      if (!r.ok) throw new Error(j.error);
      if (j.mode === 'free') { window.location.href = j.redirect; return; }
      if (!(await loadScript())) throw new Error('Could not load Razorpay. Check your connection.');
      const rz = new window.Razorpay({
        key: j.key, name: j.name, description: j.description, prefill: j.prefill, theme: { color: props.accent || '#7c3aed' },
        ...(j.mode === 'subscription' ? { subscription_id: j.subscriptionId } : { order_id: j.razorpayOrderId, amount: j.amount, currency: 'INR' }),
        handler: async (resp: any) => {
          const v = await fetch('/api/checkout/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: j.orderId, ...resp }) });
          if (!v.ok) { setErr((await v.json()).error || 'Verification failed'); setBusy(false); return; }
          window.location.href = j.redirect;
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.on('payment.failed', (resp: any) => setErr(resp.error?.description || 'Payment failed'));
      rz.open();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  const set = (fn: any, k: string) => (e: any) => fn((s: any) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span>{q.label}</span><span>{inr(q.subtotal)}</span></div>
        {q.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Coupon {applied}</span><span>−{inr(q.discount)}</span></div>}
        {q.credit > 0 && <div className="flex justify-between text-emerald-700"><span>Account credit</span><span>−{inr(q.credit)}</span></div>}
        <div className="flex justify-between border-t pt-2 text-base font-semibold">
          <span>{q.trialDays > 0 ? `Due today (${q.trialDays}-day free trial)` : q.recurring ? 'Due today' : 'Total'}</span>
          <span>{inr(q.trialDays > 0 ? 0 : q.total)}</span>
        </div>
        {q.recurring && <p className="text-xs text-zinc-500">Renews automatically at {inr(q.subtotal)} via UPI Autopay or card. Cancel anytime from your account. Prices include GST.</p>}
      </div>

      <div className="flex gap-2">
        <input className="input" placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
        <button type="button" className="btn-outline" onClick={() => requote(coupon, useCredit)} disabled={!coupon}>Apply</button>
      </div>
      {props.availableCredit > 0 && props.kind !== 'gift' && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} /> Use my credit ({inr(props.availableCredit)})</label>
      )}

      {props.gift && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="font-medium">Who is it for?</p>
          <input className="input" type="email" placeholder="Recipient email *" value={gift.recipientEmail} onChange={set(setGift, 'recipientEmail')} required />
          <input className="input" placeholder="Recipient name" value={gift.recipientName} onChange={set(setGift, 'recipientName')} />
          <select className="input" value={gift.occasion} onChange={set(setGift, 'occasion')}>
            <option value="">Occasion (optional)</option>
            {['Birthday', 'Diwali', 'Holi', 'Raksha Bandhan', 'Eid', 'Christmas', 'New Year', 'Anniversary', 'Just because'].map((o) => <option key={o}>{o}</option>)}
          </select>
          <textarea className="input" rows={3} placeholder="Personal message" value={gift.message} onChange={set(setGift, 'message')} maxLength={500} />
          <label className="block text-sm">Deliver on <input className="input mt-1" type="datetime-local" value={gift.deliverAt} onChange={set(setGift, 'deliverAt')} /></label>
        </div>
      )}

      {props.shipping && (
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          <p className="font-medium sm:col-span-2">Shipping address</p>
          <input className="input" placeholder="Full name" value={ship.name} onChange={set(setShip, 'name')} />
          <input className="input" placeholder="Phone" value={ship.phone} onChange={set(setShip, 'phone')} />
          <input className="input sm:col-span-2" placeholder="Address line 1" value={ship.line1} onChange={set(setShip, 'line1')} />
          <input className="input sm:col-span-2" placeholder="Address line 2" value={ship.line2} onChange={set(setShip, 'line2')} />
          <input className="input" placeholder="City" value={ship.city} onChange={set(setShip, 'city')} />
          <input className="input" placeholder="PIN code" value={ship.pincode} onChange={set(setShip, 'pincode')} maxLength={6} />
          <input className="input sm:col-span-2" placeholder="State" value={ship.state} onChange={set(setShip, 'state')} />
        </div>
      )}

      {props.bookingStart && (
        <textarea className="input" rows={3} placeholder="What would you like to discuss? (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      )}

      <label className="block text-sm">
        <span className="label">Your state (for GST invoice)</span>
        <select className="input" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Select state</option>
          {GST_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
      </label>

      {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      <button className="btn-primary w-full py-3 text-base" onClick={pay} disabled={busy}>
        {busy ? 'Processing…' : q.trialDays > 0 ? 'Start free trial' : q.total === 0 && !q.recurring ? 'Get it free' : `Pay ${inr(q.total)}`}
      </button>
      <p className="text-center text-xs text-zinc-400">Secure payments by Razorpay · UPI, cards, netbanking</p>
    </div>
  );
}
