import Link from 'next/link';
import { getProfile, isStaff } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { APP_NAME } from '@/lib/utils';
import { Avatar } from '@/components/ui';

export async function SiteHeader({ creatorSlot }: { creatorSlot?: React.ReactNode }) {
  const p = await getProfile();
  let unread = 0, studios: { slug: string; name: string }[] = [];
  if (p) {
    const db = admin();
    const [{ count }, { data: team }] = await Promise.all([
      db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', p.id).is('read_at', null),
      db.from('creator_team').select('creator:creators(slug, name)').eq('user_id', p.id),
    ]);
    unread = count || 0;
    studios = (team || []).map((t: any) => t.creator).filter(Boolean);
  }
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        {creatorSlot ?? <Link href="/" className="font-bold">{APP_NAME}</Link>}
        <div className="ml-auto flex items-center gap-2 text-sm">
          {p ? (
            <>
              {isStaff(p) && <Link href="/admin" className="btn-ghost btn-sm">Admin</Link>}
              {studios.length === 1 && <Link href={`/studio/${studios[0].slug}`} className="btn-ghost btn-sm">Dashboard</Link>}
              {studios.length > 1 && <Link href="/me#studios" className="btn-ghost btn-sm">Dashboards</Link>}
              <Link href="/me" className="btn-ghost btn-sm">My memberships</Link>
              <Link href="/notifications" className="btn-ghost btn-sm relative" aria-label="Notifications">
                🔔{unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{unread > 9 ? '9+' : unread}</span>}
              </Link>
              <Link href="/account" aria-label="Account"><Avatar src={p.avatar_url} name={p.full_name} size={30} /></Link>
            </>
          ) : (
            <Link href="/login" className="btn-dark btn-sm">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
