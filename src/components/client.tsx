'use client';
import { useFormStatus } from 'react-dom';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function SubmitButton({ children, className = 'btn-primary', pendingText, confirm }: { children: React.ReactNode; className?: string; pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {pending ? pendingText || 'Saving…' : children}
    </button>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-outline btn-sm" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? 'Copied!' : label}
    </button>
  );
}

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const d = Math.max(0, new Date(to).getTime() - now);
  const parts = [Math.floor(d / 86400000), Math.floor(d / 3600000) % 24, Math.floor(d / 60000) % 60, Math.floor(d / 1000) % 60];
  return (
    <div className="flex gap-3">
      {['days', 'hrs', 'min', 'sec'].map((l, i) => (
        <div key={l} className="min-w-14 rounded-lg bg-white/10 px-3 py-2 text-center">
          <div className="text-2xl font-bold tabular-nums">{String(parts[i]).padStart(2, '0')}</div>
          <div className="text-[10px] uppercase opacity-70">{l}</div>
        </div>
      ))}
    </div>
  );
}

/** Uploads a file to Supabase Storage via a server-issued signed URL, then reports the stored path. */
export function FileUpload({ name, scope, creatorId, bucket = 'public', accept, defaultValue, label = 'Upload' }: {
  name: string; scope: string; creatorId?: string; bucket?: 'public' | 'private'; accept?: string; defaultValue?: string | null; label?: string;
}) {
  const [value, setValue] = useState(defaultValue || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function onFile(f: File) {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, creatorId, bucket, filename: f.name, size: f.size }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      const put = await fetch(j.signedUrl, { method: 'PUT', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f });
      if (!put.ok) throw new Error('Upload failed');
      setValue(bucket === 'public' ? j.publicUrl : j.path);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-1">
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-2">
        <label className={cn('btn-outline btn-sm cursor-pointer', busy && 'opacity-50')}>
          {busy ? 'Uploading…' : label}
          <input type="file" className="hidden" accept={accept} disabled={busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {value && <span className="truncate text-xs text-zinc-500">{value.split('/').pop()}</span>}
        {value && <button type="button" className="text-xs text-red-600" onClick={() => setValue('')}>Remove</button>}
      </div>
      {bucket === 'public' && value && /\.(png|jpe?g|webp|gif)$/i.test(value) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-20 rounded-md border object-cover" />
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

export function MultiFileUpload({ name, scope, creatorId, accept, defaultValue = [] }: { name: string; scope: string; creatorId?: string; accept?: string; defaultValue?: string[] }) {
  const [vals, setVals] = useState<string[]>(defaultValue);
  const [busy, setBusy] = useState(false);
  async function onFiles(files: FileList) {
    setBusy(true);
    for (const f of Array.from(files)) {
      const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, creatorId, bucket: 'public', filename: f.name, size: f.size }) });
      const j = await r.json();
      if (!r.ok) continue;
      const put = await fetch(j.signedUrl, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f });
      if (put.ok) setVals((v) => [...v, j.publicUrl]);
    }
    setBusy(false);
  }
  return (
    <div>
      {vals.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      <div className="flex flex-wrap gap-2">
        {vals.map((v) => (
          <div key={v} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v} alt="" className="h-20 w-20 rounded-md border object-cover" />
            <button type="button" className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-xs shadow" onClick={() => setVals(vals.filter((x) => x !== v))}>✕</button>
          </div>
        ))}
        <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed text-xs text-zinc-500">
          {busy ? '…' : '+ Add'}
          <input type="file" multiple accept={accept || 'image/*'} className="hidden" onChange={(e) => e.target.files && onFiles(e.target.files)} />
        </label>
      </div>
    </div>
  );
}
