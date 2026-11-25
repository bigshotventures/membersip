import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { APP_NAME } from '@/lib/utils';

const NAV = [['/admin', 'Overview'], ['/admin/creators', 'Creators'], ['/admin/payments', 'Payments & refunds'], ['/admin/payouts', 'Payouts'], ['/admin/services', 'Services'], ['/admin/compliance', 'GST & DPDP'], ['/admin/users', 'Users'], ['/admin/audit', 'Audit log'], ['/admin/settings', 'Settings']];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  return (
    <div className="min-h-screen">
      <header className="border-b bg-zinc-900 text-white">
        <div className="flex h-14 items-center gap-6 overflow-x-auto px-4 text-sm">
          <Link href="/" className="font-bold">{APP_NAME}</Link><span className="badge bg-amber-400 text-zinc-900">{me.role}</span>
          {NAV.map(([h, l]) => <Link key={h} href={h} className="whitespace-nowrap text-zinc-300 hover:text-white">{l}</Link>)}
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-6">{children}</main>
    </div>
  );
}
