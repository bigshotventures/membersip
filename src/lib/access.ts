import 'server-only';
import { admin } from '@/lib/supabase/admin';

export type AccessCtx = { tierId: string | null; isStudio: boolean; entitlements: Set<string> };

export async function accessCtx(userId: string | null | undefined, creatorId: string, membership: any, isStudio: boolean): Promise<AccessCtx> {
  const ents = new Set<string>();
  if (userId) {
    const { data } = await admin().from('entitlements').select('kind, item_id').eq('user_id', userId).eq('creator_id', creatorId);
    for (const e of data || []) ents.add(`${e.kind}:${e.item_id}`);
  }
  return { tierId: membership?.hasAccess ? membership.tier_id : null, isStudio, entitlements: ents };
}

/** Mirrors the SQL can_read_post() for list rendering (the database still enforces it on the body). */
export function canSee(item: { id: string; visibility: string; tier_ids: string[] }, ctx: AccessCtx, entKind = 'post') {
  if (ctx.isStudio || item.visibility === 'public') return true;
  if (item.visibility === 'members') return !!ctx.tierId;
  const inTier = !!ctx.tierId && (item.tier_ids.length === 0 || item.tier_ids.includes(ctx.tierId));
  if (item.visibility === 'tiers') return inTier;
  if (item.visibility === 'ppv') return ctx.entitlements.has(`${entKind}:${item.id}`) || (item.tier_ids.length > 0 && inTier);
  return false;
}

export function canSeeCourse(c: { id: string; tier_ids: string[] }, ctx: AccessCtx) {
  if (ctx.isStudio || ctx.entitlements.has(`course:${c.id}`)) return true;
  return !!ctx.tierId && c.tier_ids.length > 0 && c.tier_ids.includes(ctx.tierId);
}
