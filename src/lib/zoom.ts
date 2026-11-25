import 'server-only';
import crypto from 'crypto';

let cached: { token: string; exp: number } | null = null;

async function token() {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) throw new Error('Zoom is not configured');
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64') },
    cache: 'no-store',
  });
  const j = await res.json();
  if (!res.ok) throw new Error('Zoom auth failed: ' + (j.reason || res.statusText));
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

async function zoom(path: string, method = 'GET', body?: any) {
  const res = await fetch('https://api.zoom.us/v2' + path, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 204) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Zoom: ' + (j.message || res.statusText));
  return j;
}

export async function createMeeting(opts: { topic: string; startISO: string; durationMin: number; record?: boolean }) {
  const m = await zoom('/users/me/meetings', 'POST', {
    topic: opts.topic.slice(0, 200),
    type: 2,
    start_time: opts.startISO,
    duration: opts.durationMin,
    timezone: 'Asia/Kolkata',
    password: Math.random().toString(36).slice(2, 10),
    settings: {
      join_before_host: false,
      waiting_room: false,
      mute_upon_entry: true,
      approval_type: 2,
      auto_recording: opts.record === false ? 'none' : 'cloud',
      meeting_authentication: false,
    },
  });
  return { id: String(m.id), password: m.password as string, startUrl: m.start_url as string };
}

export const updateMeeting = (id: string, patch: any) => zoom(`/meetings/${id}`, 'PATCH', patch);
export const deleteMeeting = (id: string) => zoom(`/meetings/${id}`, 'DELETE').catch(() => null);
export const getStartUrl = async (id: string) => (await zoom(`/meetings/${id}`)).start_url as string;

/** Meeting SDK signature (HS256). role 1 = host, 0 = attendee. */
export function sdkSignature(meetingNumber: string, role: 0 | 1) {
  const key = process.env.ZOOM_SDK_KEY!, secret = process.env.ZOOM_SDK_SECRET!;
  if (!key || !secret) throw new Error('Zoom Meeting SDK is not configured');
  const iat = Math.floor(Date.now() / 1000) - 30, exp = iat + 60 * 60 * 2;
  const enc = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = enc({ alg: 'HS256', typ: 'JWT' });
  const payload = enc({ appKey: key, sdkKey: key, mn: meetingNumber, role, iat, exp, tokenExp: exp });
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyZoomWebhook(raw: string, ts: string | null, sig: string | null) {
  if (!ts || !sig || !process.env.ZOOM_WEBHOOK_SECRET) return false;
  const expected = 'v0=' + crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET).update(`v0:${ts}:${raw}`).digest('hex');
  return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
export function zoomUrlValidation(plainToken: string) {
  return { plainToken, encryptedToken: crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET!).update(plainToken).digest('hex') };
}
