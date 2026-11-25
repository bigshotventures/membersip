import 'server-only';
import crypto from 'crypto';

const BASE = 'https://api.mux.com';

async function mux(path: string, method = 'GET', body?: any) {
  const id = process.env.MUX_TOKEN_ID, secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) throw new Error('Mux is not configured');
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mux: ${json?.error?.messages?.join(', ') || res.statusText}`);
  return json.data;
}

/** Direct browser upload URL. Assets get a signed playback policy (or public for previews). */
export function createDirectUpload(passthrough: string, isPublic = false) {
  return mux('/video/v1/uploads', 'POST', {
    cors_origin: process.env.NEXT_PUBLIC_APP_URL || '*',
    new_asset_settings: {
      playback_policy: [isPublic ? 'public' : 'signed'],
      passthrough,
      video_quality: 'basic',
      max_resolution_tier: '1080p',
    },
  });
}

export function createAssetFromUrl(url: string, passthrough: string, isPublic = false) {
  return mux('/video/v1/assets', 'POST', {
    input: [{ url }], playback_policy: [isPublic ? 'public' : 'signed'], passthrough, video_quality: 'basic',
  });
}

/** Preview clip cut from an existing asset, public so it can be shared on Instagram/Shorts. */
export function createClip(sourceAssetId: string, start: number, end: number, passthrough: string) {
  return mux('/video/v1/assets', 'POST', {
    input: [{ url: `mux://assets/${sourceAssetId}`, start_time: start, end_time: end }],
    playback_policy: ['public'], passthrough, video_quality: 'basic',
  });
}

export const deleteAsset = (id: string) => mux(`/video/v1/assets/${id}`, 'DELETE');

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Signed playback JWT (RS256). aud: v = video, t = thumbnail, s = storyboard. */
export function playbackToken(playbackId: string, aud: 'v' | 't' | 's' = 'v', ttlSeconds = 6 * 3600) {
  const kid = process.env.MUX_SIGNING_KEY_ID!, key = process.env.MUX_SIGNING_PRIVATE_KEY!;
  if (!kid || !key) throw new Error('Mux signing key is not configured');
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify({ sub: playbackId, aud, exp: Math.floor(Date.now() / 1000) + ttlSeconds, kid }));
  const pem = Buffer.from(key, 'base64').toString('utf8');
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${payload}`).sign(pem);
  return `${header}.${payload}.${b64url(sig)}`;
}

export function verifyWebhook(raw: string, header: string | null) {
  if (!header || !process.env.MUX_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const expected = crypto.createHmac('sha256', process.env.MUX_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
  return expected.length === v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
