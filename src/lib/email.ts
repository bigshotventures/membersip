import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { APP_NAME, APP_URL } from '@/lib/utils';

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/** Minimal, safe email layout. `body` is plain text with blank lines between paragraphs. */
export function layout(opts: { title: string; body: string; cta?: { label: string; url: string }; brand?: string; accent?: string }) {
  const accent = opts.accent || '#7c3aed';
  const paras = opts.body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const cta = opts.cta
    ? `<p style="margin:24px 0"><a href="${esc(opts.cta.url)}" style="background:${accent};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(opts.cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f6f6f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px"><div style="background:#fff;border-radius:12px;padding:28px">
  <div style="font-weight:700;color:${accent};margin-bottom:16px">${esc(opts.brand || APP_NAME)}</div>
  <h1 style="font-size:20px;margin:0 0 16px">${esc(opts.title)}</h1>${paras}${cta}</div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:16px">Sent by ${esc(APP_NAME)} · <a href="${APP_URL}/account" style="color:#9ca3af">Email preferences</a></p>
  </div></body></html>`;
}

export async function sendEmail(opts: {
  to: string; subject: string; html: string; creatorId?: string | null; userId?: string | null; template?: string;
  attachments?: { filename: string; content: string }[];
}) {
  const key = process.env.RESEND_API_KEY;
  let status = 'skipped', providerId: string | null = null, error: string | null = null;
  if (key) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [opts.to], subject: opts.subject, html: opts.html, attachments: opts.attachments }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { status = 'sent'; providerId = j.id; } else { status = 'failed'; error = j.message || res.statusText; }
    } catch (e: any) { status = 'failed'; error = e.message; }
  } else {
    error = 'RESEND_API_KEY not set';
  }
  await admin().from('message_log').insert({
    channel: 'email', recipient: opts.to, template: opts.template ?? opts.subject.slice(0, 80), status,
    provider_id: providerId, error, creator_id: opts.creatorId ?? null, user_id: opts.userId ?? null,
  });
  return status === 'sent';
}
