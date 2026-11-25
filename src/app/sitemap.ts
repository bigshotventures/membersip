import type { MetadataRoute } from 'next';
import { admin } from '@/lib/supabase/admin';
import { APP_URL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await admin().from('creators').select('slug, created_at').in('status', ['live', 'waitlist']);
  return [{ url: APP_URL, lastModified: new Date() }, ...(data || []).map((c: any) => ({ url: `${APP_URL}/${c.slug}`, lastModified: new Date(c.created_at) }))];
}
