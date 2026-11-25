'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { recordSignupConsent } from '@/actions/account';

export function LoginForm({ next }: { next: string }) {
  const sb = createClient();
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [agree, setAgree] = useState(false);
  const [marketing, setMarketing] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);

  const phone = () => { const d = id.replace(/\D/g, ''); return d.length === 10 ? `+91${d}` : `+${d}`; };

  async function send(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = mode === 'email'
      ? await sb.auth.signInWithOtp({ email: id.trim(), options: { shouldCreateUser: true } })
      : await sb.auth.signInWithOtp({ phone: phone(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = mode === 'email'
      ? await sb.auth.verifyOtp({ email: id.trim(), token: code.trim(), type: 'email' })
      : await sb.auth.verifyOtp({ phone: phone(), token: code.trim(), type: 'sms' });
    if (error) { setBusy(false); setErr(error.message); return; }
    await recordSignupConsent({ marketing, whatsapp });
    window.location.href = next;
  }
  async function google() {
    if (!agree) { setErr('Please accept the Terms and Privacy Policy'); return; }
    await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}&mk=${marketing ? 1 : 0}&wa=${whatsapp ? 1 : 0}` },
    });
  }

  if (sent) {
    return (
      <form onSubmit={verify} className="space-y-3">
        <p className="text-sm text-zinc-600">Enter the code sent to <b>{id}</b></p>
        <input className="input text-center text-lg tracking-[0.5em]" inputMode="numeric" autoFocus maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} required />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-dark w-full" disabled={busy}>{busy ? 'Verifying…' : 'Verify & continue'}</button>
        <button type="button" className="btn-ghost w-full" onClick={() => { setSent(false); setCode(''); }}>Use a different {mode}</button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-lg bg-zinc-100 p-1 text-sm">
        {(['email', 'phone'] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); setId(''); }} className={`rounded-md py-1.5 font-medium ${mode === m ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>
            {m === 'email' ? 'Email' : 'Mobile'}
          </button>
        ))}
      </div>
      <form onSubmit={send} className="space-y-3">
        {mode === 'email'
          ? <input className="input" type="email" placeholder="you@example.com" value={id} onChange={(e) => setId(e.target.value)} required />
          : <input className="input" type="tel" placeholder="98765 43210" value={id} onChange={(e) => setId(e.target.value)} required />}
        <label className="flex gap-2 text-xs text-zinc-600">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <span>I agree to the <Link href="/legal/terms" className="underline" target="_blank">Terms</Link> and consent to processing of my data as described in the <Link href="/legal/privacy" className="underline" target="_blank">Privacy Policy</Link>.</span>
        </label>
        <label className="flex gap-2 text-xs text-zinc-600">
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /> Send me updates and offers by email
        </label>
        <label className="flex gap-2 text-xs text-zinc-600">
          <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> Send reminders on WhatsApp
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-dark w-full" disabled={busy || !agree}>{busy ? 'Sending…' : 'Send code'}</button>
      </form>
      <div className="relative text-center text-xs text-zinc-400"><span className="bg-white px-2">or</span></div>
      <button type="button" onClick={google} className="btn-outline w-full">Continue with Google</button>
    </div>
  );
}
