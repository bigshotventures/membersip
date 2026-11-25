'use server';
import { studioCtx, done } from '@/lib/studio';
import { bool, int, istLocalToISO, lines, list, str, strOrNull } from '@/lib/utils';
import { runCampaign } from '@/lib/campaigns';

/* ───────── Spaces ───────── */
export async function saveSpace(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const id = strOrNull(fd, 'id');
  const row = { creator_id: creator.id, name: str(fd, 'name'), description: strOrNull(fd, 'description'), kind: str(fd, 'kind') === 'chat' ? 'chat' : 'feed', tier_ids: list(fd, 'tier_ids'), members_can_post: bool(fd, 'members_can_post'), position: int(fd, 'position') };
  if (id) await db.from('spaces').update(row).eq('id', id).eq('creator_id', creator.id);
  else await db.from('spaces').insert(row);
  done(slug, '/community', 'Space saved');
}
export async function deleteSpace(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('spaces').delete().eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/community', 'Space deleted');
}

/* ───────── Moderation ───────── */
const TABLE: Record<string, string> = { comment: 'comments', space_post: 'space_posts', chat_message: 'chat_messages' };
export async function resolveReport(fd: FormData) {
  const { creator, db, slug, profile } = await studioCtx(fd, 'moderate');
  const { data: r } = await db.from('reports').select('*').eq('id', str(fd, 'id')).eq('creator_id', creator.id).single();
  const action = str(fd, 'action');
  const table = TABLE[r.target_type];
  if (table && action === 'hide') await db.from(table).update({ hidden: true }).eq('id', r.target_id).eq('creator_id', creator.id);
  if (table && action === 'restore') await db.from(table).update({ hidden: false }).eq('id', r.target_id).eq('creator_id', creator.id);
  if (table && action === 'delete') await db.from(table).delete().eq('id', r.target_id).eq('creator_id', creator.id);
  await db.from('reports').update({ status: action === 'dismiss' || action === 'restore' ? 'dismissed' : 'actioned', resolved_by: profile.id }).eq('id', r.id);
  done(slug, '/moderation', 'Report resolved');
}
export async function saveKeywords(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd, 'moderate');
  await db.from('blocked_keywords').delete().eq('creator_id', creator.id);
  const words = Array.from(new Set(lines(str(fd, 'keywords').replace(/,/g, '\n')).map((w) => w.toLowerCase())));
  if (words.length) await db.from('blocked_keywords').insert(words.map((keyword) => ({ creator_id: creator.id, keyword })));
  done(slug, '/moderation', 'Keyword filter saved');
}

/* ───────── Challenges & gamification ───────── */
export async function saveChallenge(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const id = strOrNull(fd, 'id');
  const row = {
    creator_id: creator.id, title: str(fd, 'title'), description: strOrNull(fd, 'description'), starts_at: istLocalToISO(fd.get('starts_at')),
    days: int(fd, 'days', 30), tier_ids: list(fd, 'tier_ids'), points_per_checkin: int(fd, 'points_per_checkin', 10),
    completion_badge_id: strOrNull(fd, 'completion_badge_id'), daily_prompts: lines(str(fd, 'daily_prompts')),
  };
  if (id) await db.from('challenges').update(row).eq('id', id).eq('creator_id', creator.id);
  else await db.from('challenges').insert(row);
  done(slug, '/challenges', 'Challenge saved');
}
export async function deleteChallenge(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('challenges').delete().eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/challenges', 'Deleted');
}
export async function saveLevels(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  // "Name | min points | perk"
  const rows = lines(str(fd, 'levels')).map((l, i) => { const [name, pts, perk] = l.split('|').map((x) => x.trim()); return { creator_id: creator.id, level: i + 1, name, min_points: Number(pts) || 0, perk: perk || null }; }).filter((r) => r.name);
  await db.from('levels').delete().eq('creator_id', creator.id);
  if (rows.length) await db.from('levels').insert(rows);
  done(slug, '/gamification', 'Levels saved');
}
export async function saveBadge(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const type = str(fd, 'rule_type');
  const rule = type === 'manual' ? { type } : { type, gte: int(fd, 'rule_gte', 1) };
  const { error } = await db.from('badges').insert({ creator_id: creator.id, code: str(fd, 'name').toLowerCase().replace(/\W+/g, '_'), name: str(fd, 'name'), description: strOrNull(fd, 'description'), icon: str(fd, 'icon') || '🏅', rule });
  done(slug, '/gamification', error ? 'A badge with that name exists' : 'Badge created');
}
export async function deleteBadge(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('badges').delete().eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/gamification', 'Badge deleted');
}

/* ───────── Broadcasts ───────── */
export async function saveCampaign(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const segType = str(fd, 'segment');
  const segment = segType === 'tiers' ? { type: 'tiers', tier_ids: list(fd, 'tier_ids') } : { type: segType || 'all_members' };
  const when = istLocalToISO(fd.get('scheduled_at'));
  const { data: c } = await db.from('email_campaigns').insert({
    creator_id: creator.id, subject: str(fd, 'subject'), body: str(fd, 'body'), channel: str(fd, 'channel') || 'email', segment,
    status: when ? 'scheduled' : 'sending', scheduled_at: when,
  }).select('id').single();
  if (!when) {
    const n = await runCampaign(c.id);
    done(slug, '/campaigns', `Sent to ${n} people`);
  }
  done(slug, '/campaigns', 'Scheduled');
}

/* ───────── Sequences ───────── */
export async function saveSequence(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const id = strOrNull(fd, 'id');
  let seqId = id;
  if (id) await db.from('sequences').update({ name: str(fd, 'name'), trigger: str(fd, 'trigger'), active: bool(fd, 'active') }).eq('id', id).eq('creator_id', creator.id);
  else seqId = (await db.from('sequences').insert({ creator_id: creator.id, name: str(fd, 'name'), trigger: str(fd, 'trigger'), active: true }).select('id').single()).data.id;
  // steps submitted as step_N_* fields
  const steps: any[] = [];
  for (let i = 0; i < 10; i++) {
    const body = str(fd, `step_${i}_body`);
    if (!body) continue;
    steps.push({ sequence_id: seqId, position: steps.length, delay_hours: int(fd, `step_${i}_delay`, 24), channel: str(fd, `step_${i}_channel`) || 'email', subject: strOrNull(fd, `step_${i}_subject`), body });
  }
  await db.from('sequence_steps').delete().eq('sequence_id', seqId);
  if (steps.length) await db.from('sequence_steps').insert(steps);
  done(slug, '/sequences', 'Sequence saved');
}
export async function deleteSequence(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('sequences').delete().eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/sequences', 'Deleted');
}

/* ───────── Automations ───────── */
export async function saveAutomation(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const actions: any[] = [];
  const pick = (t: string) => list(fd, 'actions').includes(t);
  if (pick('send_email')) actions.push({ type: 'send_email', subject: str(fd, 'email_subject'), body: str(fd, 'email_body') });
  if (pick('send_whatsapp')) actions.push({ type: 'send_whatsapp', message: str(fd, 'wa_message') });
  if (pick('send_dm')) actions.push({ type: 'send_dm', body: str(fd, 'dm_body') });
  if (pick('notify')) actions.push({ type: 'notify', title: str(fd, 'notify_title'), body: str(fd, 'notify_body') });
  if (pick('grant_course')) actions.push({ type: 'grant_course', course_id: str(fd, 'course_id') });
  if (pick('award_badge')) actions.push({ type: 'award_badge', badge_id: str(fd, 'badge_id') });
  if (pick('grant_points')) actions.push({ type: 'grant_points', points: int(fd, 'points', 50) });
  if (pick('whatsapp_group_invite')) actions.push({ type: 'whatsapp_group_invite' });
  if (pick('webhook')) actions.push({ type: 'webhook', url: str(fd, 'webhook_url') });
  if (!actions.length) throw new Error('Pick at least one action');
  const conditions: any = {};
  if (strOrNull(fd, 'cond_tier_id')) conditions.tier_id = str(fd, 'cond_tier_id');
  if (strOrNull(fd, 'cond_kind')) conditions.kind = str(fd, 'cond_kind');
  await db.from('automations').insert({ creator_id: creator.id, name: str(fd, 'name'), trigger: str(fd, 'trigger'), conditions, actions });
  done(slug, '/automations', 'Automation is live');
}
export async function toggleAutomation(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('automations').update({ active: bool(fd, 'active') }).eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/automations');
}
export async function deleteAutomation(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('automations').delete().eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/automations', 'Deleted');
}
