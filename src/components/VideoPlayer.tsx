'use client';
import { useEffect, useRef, useState } from 'react';
import MuxPlayer from '@mux/mux-player-react';

type Ctx = { type: 'post' | 'lesson' | 'live' | 'studio' | 'public'; id?: string };

/** Signed Mux playback with a moving viewer watermark and watch-time tracking. */
export function VideoPlayer({ videoId, context, title, accent, onEnded }: { videoId: string; context: Ctx; title?: string; accent?: string; onEnded?: () => void }) {
  const [state, setState] = useState<{ playbackId?: string; tokens?: any; watermark?: string; error?: string }>({});
  const playing = useRef(false);

  useEffect(() => {
    fetch('/api/video/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId, context }) })
      .then(async (r) => { const j = await r.json(); setState(r.ok ? j : { error: j.error }); })
      .catch(() => setState({ error: 'Could not load video' }));
  }, [videoId, context.type, context.id]);

  useEffect(() => {
    const t = setInterval(() => {
      if (playing.current && document.visibilityState === 'visible')
        fetch('/api/video/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId, seconds: 30 }) }).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [videoId]);

  if (state.error) return <div className="flex aspect-video items-center justify-center rounded-xl bg-zinc-900 p-6 text-center text-sm text-zinc-300">{state.error}</div>;
  if (!state.playbackId) return <div className="aspect-video animate-pulse rounded-xl bg-zinc-200" />;

  return (
    <div className="relative overflow-hidden rounded-xl bg-black" onContextMenu={(e) => e.preventDefault()}>
      <MuxPlayer
        playbackId={state.playbackId}
        tokens={state.tokens}
        metadata={{ video_id: videoId, video_title: title }}
        accentColor={accent || '#7c3aed'}
        streamType="on-demand"
        style={{ aspectRatio: '16/9', width: '100%' }}
        onPlay={() => (playing.current = true)}
        onPause={() => (playing.current = false)}
        onEnded={() => { playing.current = false; onEnded?.(); }}
      />
      {state.watermark && (
        <div className="watermark pointer-events-none absolute select-none whitespace-nowrap text-xs font-medium text-white/35" style={{ textShadow: '0 0 2px rgba(0,0,0,.6)' }}>
          {state.watermark}
        </div>
      )}
    </div>
  );
}
