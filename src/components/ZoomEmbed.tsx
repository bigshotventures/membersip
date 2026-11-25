'use client';
import { useRef, useState } from 'react';

/** Joins a Zoom meeting inside the page using the Meeting SDK (component view). */
export function ZoomEmbed({ liveId, bookingId, label = 'Join session' }: { liveId?: string; bookingId?: string; label?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'joining' | 'joined' | 'error'>('idle');
  const [err, setErr] = useState('');

  async function join() {
    setStatus('joining'); setErr('');
    try {
      const r = await fetch('/api/zoom/signature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ liveId, bookingId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const { default: ZoomMtgEmbedded } = await import('@zoom/meetingsdk/embedded');
      const client = ZoomMtgEmbedded.createClient();
      await client.init({
        zoomAppRoot: root.current!, language: 'en-US', patchJsMedia: true, leaveOnPageUnload: true,
        customize: { video: { isResizable: true, viewSizes: { default: { width: Math.min(960, (root.current?.clientWidth || 960)), height: 540 } } } },
      });
      await client.join({ signature: j.signature, sdkKey: j.sdkKey, meetingNumber: j.meetingNumber, password: j.password, userName: j.userName, userEmail: j.userEmail } as any);
      setStatus('joined');
    } catch (e: any) {
      setErr(e?.message || e?.reason || 'Could not join'); setStatus('error');
    }
  }

  return (
    <div>
      {status !== 'joined' && (
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={join} disabled={status === 'joining'}>{status === 'joining' ? 'Connecting…' : label}</button>
          {err && <span className="text-sm text-red-600">{err}</span>}
        </div>
      )}
      <div ref={root} className="mt-4 min-h-0 w-full" />
    </div>
  );
}
