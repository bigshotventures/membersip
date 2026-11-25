'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function CreatorNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
        {items.map((i) => {
          const active = i.href === path || (i.href !== items[0].href && path.startsWith(i.href));
          return (
            <Link key={i.href} href={i.href} className={cn('whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium', active ? 'border-[var(--accent)] text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800')}>
              {i.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
