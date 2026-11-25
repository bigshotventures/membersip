import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStudio, StudioPerms } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { str } from '@/lib/utils';

type Need = keyof Omit<StudioPerms, 'role' | 'staff'>;

/** Resolve the creator from the form's hidden "slug" field and enforce the permission. */
export async function studioCtx(fd: FormData, need: Need = 'manage') {
  const slug = str(fd, 'slug');
  const r = await requireStudio(slug, need);
  return { ...r, slug, db: admin(), log: (action: string, entity?: string, entityId?: string, meta?: any) => audit(r.profile.id, action, { creatorId: r.creator.id, entity, entityId, meta }) };
}

export function done(slug: string, path: string, notice?: string): never {
  revalidatePath(`/studio/${slug}${path}`);
  const sep = path.includes('?') ? '&' : '?';
  redirect(`/studio/${slug}${path}${notice ? `${sep}notice=${encodeURIComponent(notice)}` : ''}`);
}
