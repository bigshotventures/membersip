import Link from 'next/link';
import { APP_NAME } from '@/lib/utils';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-6 text-sm text-zinc-500">
        <span>© {new Date().getFullYear()} {APP_NAME}</span>
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/refunds">Refunds</Link>
        <Link href="/legal/creator-agreement">Creator agreement</Link>
        <Link href="/legal/grievance">Grievance officer</Link>
      </div>
    </footer>
  );
}
