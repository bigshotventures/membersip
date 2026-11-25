'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Uploads straight from the browser to Mux using a server-issued direct-upload URL. */
export function VideoUploader({ creatorId }: { creatorId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [isPublic, setPublic] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState('');

  async function upload(file: File) {
    setErr(''); setPct(0);
    const r = await fetch('/api/video/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creatorId, title: title || file.name, isPublic }) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error); setPct(null); return; }
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', j.uploadUrl);
      xhr.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error('Upload failed')));
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(file);
    }).catch((e) => setErr(e.message));
    setPct(null); setTitle('');
    router.refresh();
  }

  return (
    <div className="card space-y-3 p-5">
      <h3 className="font-semibold">Upload a video</h3>
      <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} /> Public video (intro/trailer — no login needed)</label>
      {pct === null ? (
        <label className="btn-primary cursor-pointer">Choose video file<input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
      ) : (
        <div><div className="h-2 rounded bg-zinc-100"><div className="h-2 rounded accent-bg transition-all" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-sm text-zinc-500">Uploading… {pct}% — keep this tab open</p></div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <p className="hint">After upload, Mux processes the video (usually 1–3 minutes). Videos stream with signed links and a moving viewer watermark.</p>
    </div>
  );
}
