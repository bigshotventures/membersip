import 'server-only';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabase/admin';

export function visitorId() {
  return cookies().get('vid')?.value || 'anon';
}

/** Deterministic variant per visitor, so no cookie is needed and checkout sees the same variant. */
export function variantFor(test: { id: string; variants: any[] }, vid = visitorId()) {
  const h = crypto.createHash('sha1').update(`${test.id}:${vid}`).digest();
  return test.variants[h[0] % test.variants.length];
}

/** Running pricing test for a creator: returns the variant to render and logs a view. */
export async function pricingVariant(creatorId: string) {
  const { data: test } = await admin().from('ab_tests').select('*').eq('creator_id', creatorId).eq('status', 'running').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!test || !test.variants?.length) return null;
  const v = variantFor(test);
  await admin().from('ab_events').insert({ test_id: test.id, variant: v.key, visitor_id: visitorId(), event: 'view' });
  return { testId: test.id as string, ...v } as { testId: string; key: string; headline?: string; tier_names?: Record<string, string> };
}
