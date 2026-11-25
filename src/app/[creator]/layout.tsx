import Link from 'next/link';
import { loadCreatorPage, accentStyle } from '@/lib/public';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Footer } from '@/components/layout/Footer';
import { Avatar } from '@/components/ui';
import { CreatorNav } from '@/components/creator/CreatorNav';
import { admin } from '@/lib/supabase/admin';

export default async function CreatorLayout({ children, params }: { children: React.ReactNode; params: { creator: string } }) {
  const { creator, isMember, perms } = await loadCreatorPage(params.creator);
  const db = admin();
  const [{ count: courses }, { count: products }, { count: bookings }, { count: challenges }] = await Promise.all([
    db.from('courses').select('id', { count: 'exact', head: true }).eq('creator_id', creator.id).eq('status', 'published'),
    db.from('products').select('id', { count: 'exact', head: true }).eq('creator_id', creator.id).eq('active', true),
    db.from('booking_types').select('id', { count: 'exact', head: true }).eq('creator_id', creator.id).eq('active', true),
    db.from('challenges').select('id', { count: 'exact', head: true }).eq('creator_id', creator.id),
  ]);
  const base = `/${creator.slug}`;
  const items = [
    { href: base, label: 'Home' },
    courses ? { href: `${base}/courses`, label: 'Courses' } : null,
    { href: `${base}/live`, label: 'Live' },
    { href: `${base}/community`, label: 'Community' },
    products ? { href: `${base}/shop`, label: 'Shop' } : null,
    bookings ? { href: `${base}/book`, label: '1:1' } : null,
    challenges ? { href: `${base}/challenges`, label: 'Challenges' } : null,
    { href: `${base}/events`, label: 'Calendar' },
    { href: `${base}/leaderboard`, label: 'Leaderboard' },
    isMember ? { href: `${base}/messages`, label: 'Messages' } : null,
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <div style={accentStyle(creator)}>
      <SiteHeader creatorSlot={
        <Link href={base} className="flex items-center gap-2 font-bold">
          <Avatar src={creator.avatar_url} name={creator.name} size={28} />
          <span>{creator.name}</span>
          {creator.verified && <span title="Verified creator" className="text-sky-500">✔</span>}
        </Link>
      } />
      {creator.status !== 'live' && perms.view && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">Preview — this page is <b>{creator.status}</b>. Members can't buy yet.</div>
      )}
      <CreatorNav items={items} />
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
      <Footer />
    </div>
  );
}
