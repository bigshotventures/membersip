import 'server-only';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getCreator, getMembership, getProfile, studioPerms } from '@/lib/auth';

/** Everything a public creator page needs: the creator, the viewer, their membership and studio access. */
export async function loadCreatorPage(slug: string) {
  const creator = await getCreator(slug);
  if (!creator) notFound();
  const profile = await getProfile();
  const perms = await studioPerms(creator, profile);
  if (!['live', 'waitlist'].includes(creator.status) && !perms.view) notFound();
  const membership = profile ? await getMembership(creator.id, profile.id) : null;
  const isMember = !!membership?.hasAccess || perms.view;
  return { creator, profile, perms, membership, isMember };
}

export function accentStyle(creator: { theme?: any }) {
  return { ['--accent' as any]: creator.theme?.accent || '#7c3aed' } as CSSProperties;
}
