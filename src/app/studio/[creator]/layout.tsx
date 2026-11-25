import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCreator, requireProfile, studioPerms } from '@/lib/auth';
import { accentStyle } from '@/lib/public';
import { Avatar } from '@/components/ui';
import { StudioNav } from '@/components/studio/StudioNav';
import { APP_NAME } from '@/lib/utils';

export default async function StudioLayout({ children, params }: { children: React.ReactNode; params: { creator: string } }) {
  const profile = await requireProfile(`/studio/${params.creator}`);
  const creator = await getCreator(params.creator);
  if (!creator) notFound();
  const perms = await studioPerms(creator, profile);
  if (!perms.view) notFound();
  return (
    <div style={accentStyle(creator)} className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-30 border-b bg-white">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/" className="font-bold">{APP_NAME}</Link>
          <span className="text-zinc-300">/</span>
          <Avatar src={creator.avatar_url} name={creator.name} size={24} />
          <span className="font-medium">{creator.name}</span>
          <span className="badge capitalize">{creator.status}</span>
          {!perms.manage && <span className="badge-amber">View only</span>}
          <div className="ml-auto flex gap-2">
            <Link href={`/${creator.slug}`} className="btn-ghost btn-sm" target="_blank">View page ↗</Link>
            {perms.staff && <Link href="/admin" className="btn-ghost btn-sm">Admin</Link>}
            <Link href="/me" className="btn-ghost btn-sm">Exit</Link>
          </div>
        </div>
      </header>
      <div className="flex">
        <StudioNav slug={creator.slug} perms={perms} />
        <main className="min-w-0 flex-1 p-4 pb-20 md:p-6">{children}</main>
      </div>
    </div>
  );
}
