import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { layout, sendEmail } from '@/lib/email';
import { sendWhatsApp } from '@/lib/whatsapp';
import { APP_URL } from '@/lib/utils';

export type NotifyOpts = {
  userId: string;
  creatorId?: string | null;
  kind: string;
  title: string;
  body: string;
  link?: string;            // path, e.g. /creator/posts/123
  email?: boolean;          // default true (respects opt-in unless transactional)
  whatsapp?: boolean;       // default false (respects opt-in)
  transactional?: boolean;  // receipts, security, billing — ignore marketing opt-out
};

/** In-app notification + optional email and WhatsApp, honouring the member's channel preferences. */
export async function notify(o: NotifyOpts) {
  const db = admin();
  const { data: p } = await db.from('profiles').select('email, phone, full_name, email_opt_in, whatsapp_opt_in, deleted_at').eq('id', o.userId).single();
  if (!p || p.deleted_at) return;
  await db.from('notifications').insert({ user_id: o.userId, creator_id: o.creatorId ?? null, kind: o.kind, title: o.title, body: o.body, link: o.link ?? null });

  let brand: string | undefined, accent: string | undefined;
  if (o.creatorId) {
    const { data: c } = await db.from('creators').select('name, theme').eq('id', o.creatorId).single();
    brand = c?.name; accent = c?.theme?.accent;
  }
  const url = o.link ? (o.link.startsWith('http') ? o.link : APP_URL + o.link) : undefined;

  if (o.email !== false && p.email && (o.transactional || p.email_opt_in)) {
    await sendEmail({
      to: p.email, subject: o.title, creatorId: o.creatorId, userId: o.userId, template: o.kind,
      html: layout({ title: o.title, body: `Hi ${p.full_name || 'there'},\n\n${o.body}`, cta: url ? { label: 'Open', url } : undefined, brand, accent }),
    });
  }
  if (o.whatsapp && p.phone && (p.whatsapp_opt_in || o.transactional)) {
    await sendWhatsApp({ phone: p.phone, name: p.full_name || 'there', message: `${o.title}. ${o.body}${url ? ' ' + url : ''}`, creatorId: o.creatorId, userId: o.userId });
  }
}

/** Notify every member with access to a creator (optionally limited to tiers). */
export async function notifyMembers(creatorId: string, tierIds: string[] | null, o: Omit<NotifyOpts, 'userId' | 'creatorId'>) {
  let q = admin().from('memberships').select('user_id').eq('creator_id', creatorId).in('status', ['active', 'trialing', 'past_due']);
  if (tierIds && tierIds.length) q = q.in('tier_id', tierIds);
  const { data } = await q;
  for (const m of data || []) await notify({ ...o, userId: m.user_id, creatorId });
  return (data || []).length;
}
