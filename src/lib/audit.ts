import 'server-only';
import { admin } from '@/lib/supabase/admin';

export async function audit(actorId: string | null, action: string, opts: { creatorId?: string; entity?: string; entityId?: string; meta?: any } = {}) {
  await admin().from('audit_log').insert({
    actor_id: actorId, action, creator_id: opts.creatorId ?? null, entity: opts.entity ?? null,
    entity_id: opts.entityId ?? null, meta: opts.meta ?? {},
  });
}
