import 'server-only';
import crypto from 'crypto';
import { admin } from '@/lib/supabase/admin';
import { notify, notifyMembers } from '@/lib/notify';
import { announcePost } from '@/lib/posts';
import { deliverDueGifts } from '@/lib/fulfillment';
import { runCampaign } from '@/lib/campaigns';
import { layout, sendEmail } from '@/lib/email';
import { sendWhatsApp } from '@/lib/whatsapp';
import { resumeSubscription } from '@/lib/razorpay';
import { APP_URL, fmtTime, fmtDate } from '@/lib/utils';

export function authorized(req: Request) {
  const s = process.env.CRON_SECRET;
  return !!s && req.headers.get('authorization') === `Bearer ${s}`;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Every 5 minutes */
export async function frequent() {
  const db = admin();
  const now = Date.now();
  const log: Record<string, number> = {};

  // 1. Scheduled posts
  const { data: due } = await db.from('posts').select('id').eq('status', 'scheduled').lte('publish_at', iso(now));
  for (const p of due || []) { await db.from('posts').update({ status: 'published', published_at: iso(now) }).eq('id', p.id); await announcePost(p.id); }
  log.posts = due?.length || 0;

  // 2. Live reminders (24h and 15m)
  for (const [col, from, to, label] of [['reminder_24h_sent', 23.5 * 3600e3, 24.5 * 3600e3, 'tomorrow'], ['reminder_15m_sent', 0, 20 * 60e3, 'in 15 minutes']] as const) {
    const { data: lives } = await db.from('live_sessions').select('*, creator:creators(slug, name)').eq('status', 'scheduled').eq(col, false).gte('starts_at', iso(now + from)).lte('starts_at', iso(now + to));
    for (const l of lives || []) {
      await db.from('live_sessions').update({ [col]: true }).eq('id', l.id);
      const opts = { kind: 'live_reminder', title: `Live ${label}: ${l.title}`, body: `${l.creator.name} goes live at ${fmtTime(l.starts_at)} IST. Join from the session page — no Zoom app needed.`, link: `/${l.creator.slug}/live/${l.id}`, whatsapp: true };
      if (l.visibility === 'ppv') {
        const { data: ents } = await db.from('entitlements').select('user_id').eq('kind', 'event').eq('item_id', l.id);
        for (const e of ents || []) await notify({ ...opts, userId: e.user_id, creatorId: l.creator_id });
        if (l.tier_ids?.length) await notifyMembers(l.creator_id, l.tier_ids, opts);
      } else if (l.visibility !== 'public') await notifyMembers(l.creator_id, l.visibility === 'tiers' ? l.tier_ids : null, opts);
      else await notifyMembers(l.creator_id, null, opts);
      log.live_reminders = (log.live_reminders || 0) + 1;
    }
  }

  // 3. 1:1 booking reminders (1 hour before)
  const { data: bks } = await db.from('bookings').select('*, type:booking_types(title), creator:creators(name)').eq('status', 'confirmed').eq('reminder_sent', false).gte('starts_at', iso(now)).lte('starts_at', iso(now + 65 * 60e3));
  for (const b of bks || []) {
    await db.from('bookings').update({ reminder_sent: true }).eq('id', b.id);
    await notify({ userId: b.user_id, creatorId: b.creator_id, kind: 'booking_reminder', transactional: true, whatsapp: true, title: `Your 1:1 with ${b.creator.name} starts at ${fmtTime(b.starts_at)}`, body: 'Join from your bookings page.', link: '/account/bookings' });
  }

  // 4. Expire unpaid booking holds
  await db.from('bookings').update({ status: 'cancelled' }).eq('status', 'pending_payment').lt('created_at', iso(now - 30 * 60e3));

  // 5. Gifts due for delivery
  await deliverDueGifts();

  // 6. Scheduled broadcasts
  const { data: camps } = await db.from('email_campaigns').select('id').eq('status', 'scheduled').lte('scheduled_at', iso(now));
  for (const c of camps || []) await runCampaign(c.id);

  // 7. Sequence steps
  const { data: runs } = await db.from('sequence_runs').select('*, seq:sequences(active, creator:creators(id, slug, name, theme), sequence_steps(*))').eq('status', 'active').lte('next_run_at', iso(now)).limit(200);
  for (const r of runs || []) {
    const steps = (r.seq?.sequence_steps || []).sort((a: any, b: any) => a.position - b.position);
    const step = steps[r.next_step];
    if (!r.seq?.active || !step) { await db.from('sequence_runs').update({ status: 'done' }).eq('id', r.id); continue; }
    const { data: p } = r.user_id ? await db.from('profiles').select('full_name, email, phone, email_opt_in, whatsapp_opt_in').eq('id', r.user_id).single() : { data: null };
    const name = p?.full_name || 'there';
    const body = step.body.replace(/\{\{\s*name\s*\}\}/g, name);
    const c = r.seq.creator;
    if (step.channel === 'email') {
      const to = p?.email || r.email;
      if (to && (p ? p.email_opt_in : true)) await sendEmail({ to, subject: (step.subject || c.name).replace(/\{\{\s*name\s*\}\}/g, name), creatorId: c.id, userId: r.user_id, template: 'sequence', html: layout({ title: step.subject || c.name, body, cta: { label: `Open ${c.name}`, url: `${APP_URL}/${c.slug}` }, brand: c.name, accent: c.theme?.accent }) });
    } else if (p?.phone && p.whatsapp_opt_in) await sendWhatsApp({ phone: p.phone, name, message: body, creatorId: c.id, userId: r.user_id });
    const next = steps[r.next_step + 1];
    await db.from('sequence_runs').update(next ? { next_step: r.next_step + 1, next_run_at: iso(now + next.delay_hours * 3600e3) } : { status: 'done', next_step: r.next_step + 1 }).eq('id', r.id);
  }
  log.sequence_steps = runs?.length || 0;
  return log;
}

/** Every hour */
export async function hourly() {
  const db = admin();
  const now = Date.now();
  const log: Record<string, number> = {};

  // Resume paused memberships
  const { data: paused } = await db.from('memberships').select('*').eq('status', 'paused').lte('paused_until', iso(now));
  for (const m of paused || []) {
    if (m.razorpay_subscription_id) await resumeSubscription(m.razorpay_subscription_id).catch(() => null);
    await db.from('memberships').update({ status: 'active', paused_until: null }).eq('id', m.id);
    await notify({ userId: m.user_id, creatorId: m.creator_id, kind: 'resumed', transactional: true, title: 'Welcome back! Your membership has resumed', body: 'Your pause has ended and full access is restored.', link: '/me' });
  }
  log.resumed = paused?.length || 0;

  // Gifted / comp / imported memberships without a subscription: remind, then expire
  const { data: ending } = await db.from('memberships').select('*, creator:creators(slug, name)').is('razorpay_subscription_id', null).in('status', ['active']).neq('billing_period', 'lifetime').not('current_period_end', 'is', null).lte('current_period_end', iso(now + 3 * 86400e3));
  for (const m of ending || []) {
    if (new Date(m.current_period_end).getTime() <= now) {
      await db.from('memberships').update({ status: 'expired' }).eq('id', m.id);
      await notify({ userId: m.user_id, creatorId: m.creator_id, kind: 'expired', transactional: true, whatsapp: true, title: `Your ${m.creator.name} access has ended`, body: 'Subscribe to keep your access, progress and community.', link: `/${m.creator.slug}#join` });
    } else if (!m.last_dunning_at) {
      await db.from('memberships').update({ last_dunning_at: iso(now) }).eq('id', m.id);
      await notify({ userId: m.user_id, creatorId: m.creator_id, kind: 'expiring', transactional: true, whatsapp: true, title: `Your ${m.creator.name} access ends ${fmtDate(m.current_period_end)}`, body: 'Subscribe now so you don’t lose access.', link: `/${m.creator.slug}#join` });
    }
  }

  // Dunning nudges for past-due subscriptions (every 48h)
  const { data: pd } = await db.from('memberships').select('*, creator:creators(slug, name)').eq('status', 'past_due').or(`last_dunning_at.is.null,last_dunning_at.lt.${iso(now - 48 * 3600e3)}`);
  for (const m of pd || []) {
    await db.from('memberships').update({ last_dunning_at: iso(now) }).eq('id', m.id);
    await notify({ userId: m.user_id, creatorId: m.creator_id, kind: 'dunning', transactional: true, whatsapp: true, title: `Action needed: ${m.creator.name} payment failed`, body: 'Please check your UPI Autopay mandate or card. Your access will pause if we cannot renew.', link: '/account/billing' });
  }
  log.dunning = pd?.length || 0;

  // Win-back offers
  const { data: lost } = await db.from('memberships').select('*, creator:creators(id, slug, name, theme, settings)').in('status', ['cancelled', 'expired']).is('winback_sent_at', null).not('cancelled_at', 'is', null).limit(200);
  for (const m of lost || []) {
    const days = m.creator.settings?.winback_days ?? 7, pct = m.creator.settings?.winback_pct ?? 30;
    const after = new Date(m.cancelled_at).getTime() + days * 86400e3;
    const accessEnded = !m.current_period_end || new Date(m.current_period_end).getTime() < now;
    if (now < after || !accessEnded || !pct) continue;
    const code = `BACK${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await db.from('coupons').insert({ creator_id: m.creator_id, code, kind: 'percent', value: pct, applies_to: 'membership', max_redemptions: 1, expires_at: iso(now + 14 * 86400e3), internal: true });
    await db.from('memberships').update({ winback_sent_at: iso(now) }).eq('id', m.id);
    const { data: p } = await db.from('profiles').select('email, full_name, email_opt_in').eq('id', m.user_id).single();
    if (p?.email && p.email_opt_in) await sendEmail({ to: p.email, subject: `We miss you — ${pct}% off to come back to ${m.creator.name}`, creatorId: m.creator_id, userId: m.user_id, template: 'winback',
      html: layout({ title: `Come back for ${pct}% off`, body: `Hi ${p.full_name || 'there'},\n\nA lot has happened since you left. Use code ${code} in the next 14 days for ${pct}% off your first period back.`, cta: { label: 'Rejoin now', url: `${APP_URL}/${m.creator.slug}#join` }, brand: m.creator.name, accent: m.creator.theme?.accent }) });
  }

  // Drip: lessons unlocking in the last hour
  const { data: drips } = await db.from('lessons').select('id, title, drip_days, course:courses(id, slug, title, creator:creators(id, slug))').gt('drip_days', 0);
  for (const l of drips || []) {
    const c: any = l.course;
    const { data: enr } = await db.from('enrollments').select('user_id, enrolled_at, cohort:cohorts(starts_at)').eq('course_id', c.id);
    for (const e of enr || []) {
      const unlock = new Date((e as any).cohort?.starts_at || e.enrolled_at).getTime() + l.drip_days * 86400e3;
      if (unlock <= now && unlock > now - 3600e3) await notify({ userId: e.user_id, creatorId: c.creator.id, kind: 'drip', title: `New lesson unlocked: ${l.title}`, body: c.title, link: `/${c.creator.slug}/courses/${c.slug}/learn/${l.id}` });
    }
  }
  return log;
}

/** Daily */
export async function daily() {
  const db = admin();
  const { data: n } = await db.rpc('award_tenure_badges');
  // Anniversary notes for 1/2/3-year members
  const { data: ms } = await db.from('memberships').select('user_id, creator_id, started_at, creator:creators(name, slug)').in('status', ['active', 'past_due']);
  const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(5, 10);
  let anniversaries = 0;
  for (const m of ms || []) {
    const s = new Date(+new Date(m.started_at) + 330 * 60e3);
    const years = new Date().getUTCFullYear() - s.getUTCFullYear();
    if (years >= 1 && s.toISOString().slice(5, 10) === today) {
      anniversaries++;
      await notify({ userId: m.user_id, creatorId: m.creator_id, kind: 'anniversary', title: `🎂 Happy ${years}-year anniversary with ${(m as any).creator.name}!`, body: 'Thank you for being part of the community.', link: `/${(m as any).creator.slug}/leaderboard`, email: true });
    }
  }
  // Housekeeping
  await db.from('notifications').delete().lt('created_at', iso(Date.now() - 180 * 86400e3)).not('read_at', 'is', null);
  return { tenure_badges: n, anniversaries };
}
