'use server';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { studioCtx, done } from '@/lib/studio';
import { admin } from '@/lib/supabase/admin';
import { bool, int, list, str, strOrNull, toPaise } from '@/lib/utils';
import { compMembership } from '@/lib/fulfillment';
import { notify } from '@/lib/notify';
import { parseCSV } from '@/lib/csv';
import { readPrivate } from '@/lib/storage';
import { cancelSubscription } from '@/lib/razorpay';

/* ───────── Shop ───────── */
export async function saveProduct(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const id = strOrNull(fd, 'id');
  const files = list(fd, 'file_path').map((path) => ({ name: path.split('/').pop()!.replace(/^[a-f0-9]{8}-/, ''), path, stamp: bool(fd, 'stamp') }));
  const row: any = {
    creator_id: creator.id, kind: str(fd, 'kind') === 'merch' ? 'merch' : 'digital', title: str(fd, 'title'), description: strOrNull(fd, 'description'),
    cover_url: strOrNull(fd, 'cover_url'), price_paise: toPaise(fd.get('price')) || 0, stock: fd.get('stock') === '' ? null : int(fd, 'stock'),
    eligible_tier_ids: list(fd, 'eligible_tier_ids'), active: !bool(fd, 'inactive'), position: int(fd, 'position'),
  };
  if (files.length || !id) row.files = files;
  if (id) await db.from('products').update(row).eq('id', id).eq('creator_id', creator.id);
  else await db.from('products').insert(row);
  done(slug, '/shop', 'Product saved');
}

export async function updateFulfillment(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd, 'moderate');
  const { data: o } = await db.from('orders').select('*').eq('id', str(fd, 'id')).eq('creator_id', creator.id).single();
  const status = str(fd, 'fulfillment_status');
  await db.from('orders').update({ fulfillment_status: status, tracking_info: strOrNull(fd, 'tracking_info') }).eq('id', o.id);
  if (status === 'shipped') await notify({ userId: o.user_id, creatorId: creator.id, kind: 'shipped', transactional: true, whatsapp: true, title: `Your order has shipped: ${o.meta?.label}`, body: strOrNull(fd, 'tracking_info') || 'It is on its way!', link: '/account/orders' });
  done(slug, '/shop?tab=orders', 'Order updated');
}

/* ───────── Members ───────── */
async function findOrInviteUser(email: string, name?: string | null) {
  const db = admin();
  const { data: p } = await db.from('profiles').select('id').eq('email', email.toLowerCase()).maybeSingle();
  if (p) return p.id as string;
  const { data, error } = await db.auth.admin.createUser({ email: email.toLowerCase(), email_confirm: true, user_metadata: { full_name: name || undefined } });
  if (error) throw error;
  return data.user.id as string;
}

export async function addMember(fd: FormData) {
  const { creator, slug, log, perms } = await studioCtx(fd, 'manage');
  if (!perms.staff) throw new Error('Only the platform team can grant free memberships');
  const userId = await findOrInviteUser(str(fd, 'email'), strOrNull(fd, 'name'));
  await compMembership(userId, creator.id, str(fd, 'tier_id'), int(fd, 'months') || null, 'comp');
  await log('member.comp', 'user', userId, { months: int(fd, 'months') });
  done(slug, '/members', 'Member added — they can sign in with their email');
}

export async function endMembership(fd: FormData) {
  const { creator, db, slug, log, perms } = await studioCtx(fd, 'manage');
  if (!perms.staff) throw new Error('Only the platform team can end memberships');
  const { data: m } = await db.from('memberships').select('*').eq('id', str(fd, 'id')).eq('creator_id', creator.id).single();
  if (m.razorpay_subscription_id) await cancelSubscription(m.razorpay_subscription_id, !bool(fd, 'immediately')).catch(() => null);
  await db.from('memberships').update(bool(fd, 'immediately') ? { status: 'expired', cancelled_at: new Date().toISOString(), current_period_end: new Date().toISOString() } : { cancel_at_period_end: true, cancelled_at: new Date().toISOString() }).eq('id', m.id);
  await log('member.end', 'membership', m.id);
  done(slug, '/members', 'Membership ended');
}

export async function restrictMember(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd, 'moderate');
  const userId = str(fd, 'user_id'), kind = str(fd, 'kind');
  if (kind === 'clear') await db.from('member_restrictions').delete().eq('creator_id', creator.id).eq('user_id', userId);
  else await db.from('member_restrictions').upsert({ creator_id: creator.id, user_id: userId, kind, until: int(fd, 'days') ? new Date(Date.now() + int(fd, 'days') * 86400000).toISOString() : null, reason: strOrNull(fd, 'reason') }, { onConflict: 'creator_id,user_id' });
  done(slug, str(fd, 'back') || '/members', kind === 'clear' ? 'Restriction removed' : `Member ${kind}`);
}

export async function awardBadge(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('user_badges').upsert({ user_id: str(fd, 'user_id'), badge_id: str(fd, 'badge_id'), creator_id: creator.id }, { onConflict: 'user_id,badge_id' });
  done(slug, '/members', 'Badge awarded');
}

/* ───────── Imports (Patreon / Graphy / Teachable / Telegram / CSV) ───────── */
export async function runImport(fd: FormData) {
  const { creator, db, slug, profile, perms } = await studioCtx(fd);
  const source = str(fd, 'source'), kind = str(fd, 'kind');
  const path = strOrNull(fd, 'file_path');
  const text = path ? new TextDecoder().decode(await readPrivate(path)) : str(fd, 'csv');
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('No rows found. The first line must be the column headers.');
  const { data: imp } = await db.from('imports').insert({ creator_id: creator.id, source, kind, created_by: profile.id }).select('id').single();
  const stats = { total: rows.length, imported: 0, skipped: 0, errors: [] as string[] };

  if (kind === 'members') {
    if (!perms.staff) throw new Error('Member imports are run by the platform team');
    const tierId = str(fd, 'tier_id');
    const months = int(fd, 'months', 1);
    for (const r of rows) {
      const email = (r.email || r.email_address || r.patron_email || '').toLowerCase();
      const phone = r.phone || r.mobile || r.phone_number || '';
      if (!email) { stats.skipped++; continue; }
      try {
        const uid = await findOrInviteUser(email, r.name || r.full_name || r.first_name);
        if (phone) await db.from('profiles').update({ phone }).eq('id', uid).is('phone', null);
        await compMembership(uid, creator.id, tierId, months, 'import');
        stats.imported++;
      } catch (e: any) { stats.errors.push(`${email}: ${e.message}`); }
    }
  } else {
    for (const r of rows) {
      const title = r.title || r.name || r.post_title;
      if (!title) { stats.skipped++; continue; }
      const { data: post } = await db.from('posts').insert({
        creator_id: creator.id, author_id: profile.id, title, excerpt: (r.excerpt || r.summary || '').slice(0, 300) || null,
        visibility: (r.visibility || '').toLowerCase().includes('public') ? 'public' : 'members', status: 'published',
        published_at: r.published_at || r.date || r.created_at ? new Date(r.published_at || r.date || r.created_at).toISOString() : new Date().toISOString(),
        notified_at: new Date().toISOString(),
      }).select('id').single();
      await db.from('post_bodies').insert({ post_id: post.id, body: r.body || r.content || r.text || '' });
      stats.imported++;
    }
  }
  await db.from('imports').update({ status: 'done', stats: { ...stats, errors: stats.errors.slice(0, 50) } }).eq('id', imp.id);
  done(slug, '/imports', `Imported ${stats.imported} of ${stats.total}${stats.errors.length ? ` (${stats.errors.length} errors)` : ''}`);
}

/* ───────── Webhooks & API keys ───────── */
export async function addWebhook(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const url = str(fd, 'url');
  if (!/^https:\/\//.test(url)) throw new Error('Webhook URL must start with https://');
  await db.from('webhook_endpoints').insert({ creator_id: creator.id, url, events: list(fd, 'events') });
  done(slug, '/integrations', 'Webhook added');
}
export async function deleteWebhook(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('webhook_endpoints').delete().eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/integrations', 'Webhook removed');
}
export async function createApiKey(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const key = `chk_${crypto.randomBytes(24).toString('base64url')}`;
  await db.from('api_keys').insert({ creator_id: creator.id, name: str(fd, 'name') || 'API key', prefix: key.slice(0, 10), key_hash: crypto.createHash('sha256').update(key).digest('hex') });
  cookies().set('new_api_key', key, { maxAge: 60, httpOnly: true, path: `/studio/${slug}/integrations` });
  done(slug, '/integrations', 'API key created — copy it now, it won’t be shown again');
}
export async function revokeApiKey(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/integrations', 'Key revoked');
}

/* ───────── Team (platform staff only) ───────── */
export async function addTeamMember(fd: FormData) {
  const { creator, db, slug, perms, log } = await studioCtx(fd);
  if (!perms.staff) throw new Error('Only the platform team can manage team access');
  const userId = await findOrInviteUser(str(fd, 'email'), strOrNull(fd, 'name'));
  await db.from('creator_team').upsert({ creator_id: creator.id, user_id: userId, role: str(fd, 'role') }, { onConflict: 'creator_id,user_id' });
  await db.from('profiles').update({ role: 'creator' }).eq('id', userId).eq('role', 'member');
  await log('team.add', 'user', userId, { role: str(fd, 'role') });
  done(slug, '/team', 'Team member added — they sign in with their email');
}
export async function removeTeamMember(fd: FormData) {
  const { creator, db, slug, perms } = await studioCtx(fd);
  if (!perms.staff) throw new Error('Only the platform team can manage team access');
  await db.from('creator_team').delete().eq('creator_id', creator.id).eq('user_id', str(fd, 'user_id'));
  done(slug, '/team', 'Removed');
}
export async function saveSplit(fd: FormData) {
  const { creator, db, slug, perms } = await studioCtx(fd);
  if (!perms.staff) throw new Error('Only the platform team can set revenue splits');
  const { data: partner } = await db.from('creators').select('id').eq('slug', str(fd, 'partner_slug').toLowerCase()).single();
  if (!partner) throw new Error('Partner creator not found');
  await db.from('revenue_splits').upsert({ creator_id: creator.id, item_kind: str(fd, 'item_kind'), item_id: str(fd, 'item_id'), partner_creator_id: partner.id, pct: Number(fd.get('pct')) }, { onConflict: 'item_kind,item_id,partner_creator_id' });
  done(slug, '/team', 'Revenue split saved');
}
export async function toggleCreatorEditing(fd: FormData) {
  const { creator, db, slug, perms } = await studioCtx(fd);
  if (!perms.staff) throw new Error('Not allowed');
  await db.from('creators').update({ creator_edit_enabled: bool(fd, 'enabled') }).eq('id', creator.id);
  done(slug, '/team', 'Updated');
}

/* ───────── Done-for-you services ───────── */
export async function requestService(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd, 'view');
  const { data: pkg } = await db.from('service_packages').select('*').eq('id', str(fd, 'package_id')).eq('active', true).single();
  await db.from('service_orders').insert({ creator_id: creator.id, package_id: pkg.id, brief: strOrNull(fd, 'brief'), price_paise: pkg.price_paise });
  const { data: staff } = await db.from('profiles').select('id').in('role', ['admin', 'team']);
  for (const s of staff || []) await notify({ userId: s.id, kind: 'service_request', title: `${creator.name} requested ${pkg.title}`, body: strOrNull(fd, 'brief') || '', link: '/admin/services', email: true });
  done(slug, '/services', 'Request sent — the team will be in touch');
}

/* ───────── Gifts (staff can void) ───────── */
export async function voidGift(fd: FormData) {
  const { creator, db, slug, perms } = await studioCtx(fd);
  if (!perms.staff) throw new Error('Not allowed');
  await db.from('gift_cards').update({ status: 'void' }).eq('id', str(fd, 'id')).eq('creator_id', creator.id).neq('status', 'redeemed');
  done(slug, '/gifts', 'Gift voided');
}
