import 'server-only';
import { cache } from 'react';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';

export type Profile = {
  id: string; email: string | null; phone: string | null; full_name: string | null; avatar_url: string | null;
  bio: string | null; role: 'admin' | 'team' | 'creator' | 'member'; state_code: string | null;
  email_opt_in: boolean; whatsapp_opt_in: boolean; calendar_token: string; referral_code: string; credit_paise: number;
};

export const getUser = cache(async () => {
  const { data } = await createClient().auth.getUser();
  return data.user ?? null;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const { data } = await admin().from('profiles').select('*').eq('id', user.id).single();
  return data;
});

export async function requireProfile(next = '/me'): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect(`/login?next=${encodeURIComponent(next)}`);
  return p;
}

export function isStaff(p: Profile | null) {
  return !!p && (p.role === 'admin' || p.role === 'team');
}

export async function requireStaff(): Promise<Profile> {
  const p = await requireProfile('/admin');
  if (!isStaff(p)) notFound();
  return p;
}

export type Creator = Record<string, any> & { id: string; slug: string; name: string; status: string };

export const getCreator = cache(async (slug: string): Promise<Creator | null> => {
  const { data } = await admin().from('creators').select('*').eq('slug', slug.toLowerCase()).maybeSingle();
  return data;
});

export type StudioPerms = { view: boolean; manage: boolean; moderate: boolean; finance: boolean; staff: boolean; role: string };

export async function studioPerms(creator: Creator, profile: Profile | null): Promise<StudioPerms> {
  const none = { view: false, manage: false, moderate: false, finance: false, staff: false, role: '' };
  if (!profile) return none;
  if (isStaff(profile)) return { view: true, manage: true, moderate: true, finance: true, staff: true, role: profile.role };
  const { data } = await admin().from('creator_team').select('role').eq('creator_id', creator.id).eq('user_id', profile.id).maybeSingle();
  if (!data) return none;
  const r = data.role as string;
  return {
    view: true,
    manage: creator.creator_edit_enabled && (r === 'owner' || r === 'editor'),
    moderate: ['owner', 'editor', 'moderator'].includes(r),
    finance: ['owner', 'accountant'].includes(r),
    staff: false,
    role: r,
  };
}

/** Load a creator for the studio and enforce a permission level. */
export async function requireStudio(slug: string, need: keyof Omit<StudioPerms, 'role' | 'staff'> = 'view') {
  const profile = await requireProfile(`/studio/${slug}`);
  const creator = await getCreator(slug);
  if (!creator) notFound();
  const perms = await studioPerms(creator, profile);
  if (!perms.view) notFound();
  if (!perms[need]) throw new Error('You do not have permission to do this. Ask the platform team.');
  return { profile, creator, perms };
}

/** Membership of the current user with a creator, including whether it currently grants access. */
export async function getMembership(creatorId: string, userId?: string | null) {
  if (!userId) return null;
  const { data } = await admin().from('memberships').select('*, tier:tiers!memberships_tier_id_fkey(id,name,position,whatsapp_group_link,merch_discount_pct)')
    .eq('creator_id', creatorId).eq('user_id', userId).maybeSingle();
  if (!data) return null;
  const grace = 7 * 86400000;
  const end = data.current_period_end ? new Date(data.current_period_end).getTime() : 0;
  const hasAccess =
    data.status === 'active' || data.status === 'trialing' ||
    (data.status === 'past_due' && Date.now() < end + grace) ||
    (data.status === 'cancelled' && end > Date.now());
  return { ...data, hasAccess };
}
