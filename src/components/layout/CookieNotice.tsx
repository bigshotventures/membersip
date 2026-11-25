'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

/** We only set essential cookies (login session, referral, A/B bucket) — this notice informs, per DPDP. */
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { setShow(!localStorage.getItem('cookie-ok')); } catch {} }, []);
  if (!show) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border bg-white p-4 text-sm shadow-lg">
      We use only essential cookies to keep you signed in and make checkout work. See our <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
      <div className="mt-3 text-right">
        <button className="btn-dark btn-sm" onClick={() => { try { localStorage.setItem('cookie-ok', '1'); } catch {} setShow(false); }}>Got it</button>
      </div>
    </div>
  );
}
