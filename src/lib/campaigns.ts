import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { layout, sendEmail } from '@/lib/email';
import { sendWhatsApp } from '@/lib/whatsapp';
import { APP_URL } from '@/lib/utils';

/** Resolve a broadcast segment and send. Marketing emails respect opt-in. */
export async function runCampaign(id: string) {
  const db = admin();
  const { data: c } = await db.from('email_campaigns').select('*, creator:creators(id, slug, name, theme)').eq('id', id).single();
  if (!c || c.status === 'sent') return 0;
  await db.from('email_campaigns').update({ status: 'sending' }).eq('id', id);
  const seg = c.segment || { type: 'all_members' };
  let recipients: { email: string | null; phone: string | null; name: string | null; id: string | null; email_ok: boolean; wa_ok: boolean }[] = [];

  if (seg.type === 'waitlist') {
    const { data } = await db.from('waitlist').select('email, name, phone').eq('creator_id', c.creator_id);
    recipients = (data || []).map((w: any) => ({ email: w.email, phone: w.phone, name: w.name, id: null, email_ok: true, wa_ok: false }));
  } else {
    let q = db.from('memberships').select('status, tier_id, user:profiles!memberships_user_id_fkey(id, email, phone, full_name, email_opt_in, whatsapp_opt_in)').eq('creator_id', c.creator_id);
    if (seg.type === 'churned') q = q.in('status', ['cancelled', 'expired']);
    else if (seg.type === 'past_due') q = q.eq('status', 'past_due');
    else if (seg.type === 'trialing') q = q.eq('status', 'trialing');
    else q = q.in('status', ['active', 'trialing', 'past_due']);
    if (seg.type === 'tiers' && seg.tier_ids?.length) q = q.in('tier_id', seg.tier_ids);
    const { data } = await q;
    recipients = (data || []).map((m: any) => ({ email: m.user?.email, phone: m.user?.phone, name: m.user?.full_name, id: m.user?.id, email_ok: !!m.user?.email_opt_in, wa_ok: !!m.user?.whatsapp_opt_in }));
  }

  let sent = 0;
  for (const r of recipients) {
    const body = c.body.replace(/\{\{\s*name\s*\}\}/g, r.name || 'there');
    if ((c.channel === 'email' || c.channel === 'both') && r.email && r.email_ok) {
      const ok = await sendEmail({ to: r.email, subject: c.subject, creatorId: c.creator_id, userId: r.id, template: `campaign:${id}`,
        html: layout({ title: c.subject, body, cta: { label: `Open ${c.creator.name}`, url: `${APP_URL}/${c.creator.slug}` }, brand: c.creator.name, accent: c.creator.theme?.accent }) });
      if (ok) sent++;
    }
    if ((c.channel === 'whatsapp' || c.channel === 'both') && r.phone && r.wa_ok) {
      if (await sendWhatsApp({ phone: r.phone, name: r.name || 'there', message: `${c.subject}: ${body}`, creatorId: c.creator_id, userId: r.id })) sent++;
    }
  }
  await db.from('email_campaigns').update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: sent }).eq('id', id);
  return sent;
}
