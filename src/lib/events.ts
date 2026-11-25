import 'server-only';
import crypto from 'crypto';
import { admin } from '@/lib/supabase/admin';
import { notify } from '@/lib/notify';
import { layout, sendEmail } from '@/lib/email';
import { sendWhatsApp } from '@/lib/whatsapp';
import { APP_URL } from '@/lib/utils';

export type EventName =
  | 'member_joined' | 'member_cancelled' | 'tier_changed' | 'purchase' | 'course_completed'
  | 'challenge_completed' | 'payment_failed' | 'waitlist_joined' | 'course_enrolled' | 'level_up';

export const EVENT_LABELS: Record<EventName, string> = {
  member_joined: 'Member joins', member_cancelled: 'Member cancels', tier_changed: 'Member changes tier',
  purchase: 'One-off purchase', course_completed: 'Course completed', challenge_completed: 'Challenge completed',
  payment_failed: 'Renewal payment fails', waitlist_joined: 'Joins waitlist', course_enrolled: 'Enrols in course', level_up: 'Levels up',
};

type EventData = { userId?: string | null; email?: string | null; tierId?: string | null; kind?: string; itemId?: string; [k: string]: any };

function fill(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

/** Fan an event out to: automations, outgoing webhooks (Zapier etc.) and email/WhatsApp sequences. */
export async function fireEvent(creatorId: string, event: EventName, data: EventData) {
  const db = admin();
  const [{ data: creator }, { data: profile }] = await Promise.all([
    db.from('creators').select('id, slug, name, theme, whatsapp_group_link').eq('id', creatorId).single(),
    data.userId ? db.from('profiles').select('id, email, phone, full_name').eq('id', data.userId).single() : Promise.resolve({ data: null }),
  ]);
  const vars = {
    name: profile?.full_name || 'there', creator: creator?.name || '', link: `${APP_URL}/${creator?.slug}`,
  };

  // 1) Automations
  const { data: autos } = await db.from('automations').select('*').eq('creator_id', creatorId).eq('trigger', event).eq('active', true);
  for (const a of autos || []) {
    const cond = a.conditions || {};
    if (cond.tier_id && cond.tier_id !== data.tierId) continue;
    if (cond.kind && cond.kind !== data.kind) continue;
    if (cond.item_id && cond.item_id !== data.itemId) continue;
    const log: string[] = [];
    try {
      for (const act of a.actions || []) log.push(await runAction(act, { creator, profile, data, vars }));
      await db.from('automation_runs').insert({ automation_id: a.id, user_id: data.userId ?? null, status: 'ok', log: log.join('\n') });
      await db.from('automations').update({ run_count: (a.run_count || 0) + 1 }).eq('id', a.id);
    } catch (e: any) {
      await db.from('automation_runs').insert({ automation_id: a.id, user_id: data.userId ?? null, status: 'error', log: [...log, e.message].join('\n') });
    }
  }

  // 2) Outgoing webhooks
  const { data: hooks } = await db.from('webhook_endpoints').select('*').eq('creator_id', creatorId).eq('active', true);
  const payload = JSON.stringify({
    event, created_at: new Date().toISOString(), creator: { id: creatorId, slug: creator?.slug },
    member: profile ? { id: profile.id, email: profile.email, name: profile.full_name } : data.email ? { email: data.email } : null,
    data: { tier_id: data.tierId ?? null, kind: data.kind ?? null, item_id: data.itemId ?? null },
  });
  for (const h of hooks || []) {
    if (h.events?.length && !h.events.includes(event)) continue;
    const sig = crypto.createHmac('sha256', h.secret).update(payload).digest('hex');
    let status: number | null = null, error: string | null = null;
    try {
      const r = await fetch(h.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CreatorHub-Signature': sig, 'X-CreatorHub-Event': event }, body: payload, signal: AbortSignal.timeout(8000) });
      status = r.status;
    } catch (e: any) { error = e.message; }
    await db.from('webhook_deliveries').insert({ endpoint_id: h.id, event, status_code: status, error });
  }

  // 3) Sequences
  const seqTrigger = ({ member_joined: 'member_joined', waitlist_joined: 'waitlist_joined', member_cancelled: 'member_cancelled', course_enrolled: 'course_enrolled', purchase: 'purchase' } as any)[event];
  if (seqTrigger) {
    const { data: seqs } = await db.from('sequences').select('id, sequence_steps(position, delay_hours)').eq('creator_id', creatorId).eq('trigger', seqTrigger).eq('active', true);
    for (const s of seqs || []) {
      const first = (s.sequence_steps || []).sort((a: any, b: any) => a.position - b.position)[0];
      if (!first) continue;
      await db.from('sequence_runs').insert({
        sequence_id: s.id, user_id: data.userId ?? null, email: data.email ?? profile?.email ?? null,
        next_step: 0, next_run_at: new Date(Date.now() + first.delay_hours * 3600000).toISOString(),
      });
    }
    if (event === 'member_cancelled' && data.userId) {
      // stop onboarding sequences for people who left
      const { data: joinSeqs } = await db.from('sequences').select('id').eq('creator_id', creatorId).eq('trigger', 'member_joined');
      if (joinSeqs?.length) await db.from('sequence_runs').update({ status: 'stopped' }).eq('user_id', data.userId).in('sequence_id', joinSeqs.map((x: any) => x.id)).eq('status', 'active');
    }
  }
}

async function runAction(act: any, ctx: { creator: any; profile: any; data: EventData; vars: Record<string, string> }) {
  const db = admin();
  const { creator, profile, data, vars } = ctx;
  const uid = profile?.id as string | undefined;
  switch (act.type) {
    case 'send_email': {
      const to = profile?.email || data.email;
      if (!to) return 'send_email: no address';
      await sendEmail({
        to, subject: fill(act.subject || '', vars), creatorId: creator.id, userId: uid, template: 'automation',
        html: layout({ title: fill(act.subject || '', vars), body: fill(act.body || '', vars), brand: creator.name, accent: creator.theme?.accent }),
      });
      return 'send_email: sent';
    }
    case 'send_whatsapp':
      if (!profile) return 'send_whatsapp: no member';
      await sendWhatsApp({ phone: profile.phone, name: vars.name, message: fill(act.message || '', vars), creatorId: creator.id, userId: uid });
      return 'send_whatsapp: sent';
    case 'notify':
      if (!uid) return 'notify: no member';
      await notify({ userId: uid, creatorId: creator.id, kind: 'automation', title: fill(act.title || '', vars), body: fill(act.body || '', vars), link: act.link, email: false });
      return 'notify: ok';
    case 'grant_course':
      if (!uid || !act.course_id) return 'grant_course: skipped';
      await db.from('entitlements').upsert({ user_id: uid, creator_id: creator.id, kind: 'course', item_id: act.course_id }, { onConflict: 'user_id,kind,item_id' });
      return 'grant_course: ok';
    case 'award_badge':
      if (!uid || !act.badge_id) return 'award_badge: skipped';
      await db.from('user_badges').upsert({ user_id: uid, badge_id: act.badge_id, creator_id: creator.id }, { onConflict: 'user_id,badge_id' });
      return 'award_badge: ok';
    case 'grant_points':
      if (!uid) return 'grant_points: skipped';
      await db.rpc('award_points', { c: creator.id, u: uid, pts: Number(act.points) || 0, why: 'automation', ref: null });
      return 'grant_points: ok';
    case 'send_dm': {
      if (!uid) return 'send_dm: skipped';
      const { data: owner } = await db.from('creator_team').select('user_id').eq('creator_id', creator.id).eq('role', 'owner').limit(1).maybeSingle();
      if (!owner) return 'send_dm: creator has no owner account';
      await db.from('direct_messages').insert({ creator_id: creator.id, member_id: uid, sender_id: owner.user_id, body: fill(act.body || '', vars) });
      return 'send_dm: ok';
    }
    case 'whatsapp_group_invite': {
      if (!profile) return 'whatsapp_group_invite: no member';
      let link = creator.whatsapp_group_link;
      if (data.tierId) {
        const { data: t } = await db.from('tiers').select('whatsapp_group_link').eq('id', data.tierId).single();
        link = t?.whatsapp_group_link || link;
      }
      if (!link) return 'whatsapp_group_invite: no group link set';
      await sendWhatsApp({ phone: profile.phone, name: vars.name, message: `Here's your invite to the ${creator.name} WhatsApp group: ${link}`, creatorId: creator.id, userId: uid });
      await notify({ userId: uid, creatorId: creator.id, kind: 'whatsapp_group', title: 'Join the WhatsApp group', body: 'Tap to join the members-only WhatsApp group.', link, email: true });
      return 'whatsapp_group_invite: sent';
    }
    case 'webhook':
      if (!/^https:\/\//.test(act.url || '')) return 'webhook: invalid url';
      await fetch(act.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creator: creator.slug, member: profile?.email, ...data }), signal: AbortSignal.timeout(8000) });
      return 'webhook: posted';
    default:
      return `unknown action ${act.type}`;
  }
}
