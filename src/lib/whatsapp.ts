import 'server-only';
import { admin } from '@/lib/supabase/admin';

export function normalizePhone(p: string | null | undefined) {
  if (!p) return null;
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  if (d.length === 12 && d.startsWith('91')) return d;
  if (d.length > 10) return d;
  return null;
}

/**
 * Sends the approved utility template WHATSAPP_TEMPLATE_NAME with two variables: name and message.
 * Business-initiated WhatsApp messages must use pre-approved templates (Meta policy).
 */
export async function sendWhatsApp(opts: { phone: string | null | undefined; name: string; message: string; creatorId?: string | null; userId?: string | null; template?: string }) {
  const to = normalizePhone(opts.phone);
  if (!to) return false;
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID, token = process.env.WHATSAPP_ACCESS_TOKEN;
  let status = 'skipped', providerId: string | null = null, error: string | null = null;
  if (id && token) {
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: opts.template || process.env.WHATSAPP_TEMPLATE_NAME || 'platform_update',
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
            components: [{ type: 'body', parameters: [
              { type: 'text', text: (opts.name || 'there').slice(0, 60) },
              { type: 'text', text: opts.message.replace(/\s+/g, ' ').slice(0, 900) },
            ] }],
          },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { status = 'sent'; providerId = j.messages?.[0]?.id ?? null; }
      else { status = 'failed'; error = j.error?.message || res.statusText; }
    } catch (e: any) { status = 'failed'; error = e.message; }
  } else error = 'WhatsApp not configured';
  await admin().from('message_log').insert({
    channel: 'whatsapp', recipient: to, template: opts.template ?? 'platform_update', status, provider_id: providerId,
    error, creator_id: opts.creatorId ?? null, user_id: opts.userId ?? null,
  });
  return status === 'sent';
}
