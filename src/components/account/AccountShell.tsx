import Link from 'next/link';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Footer } from '@/components/layout/Footer';

const LINKS = [
  ['/me', 'My memberships'], ['/account', 'Profile'], ['/account/billing', 'Billing & invoices'], ['/account/orders', 'Orders & downloads'],
  ['/account/bookings', '1:1 bookings'], ['/account/gifts', 'Gifts & referrals'], ['/notifications', 'Notifications'], ['/account/privacy', 'Privacy & data'],
];

export function AccountShell({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-4">
        <nav className="space-y-1">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={`block rounded-lg px-3 py-2 text-sm ${active === href ? 'bg-white font-semibold shadow-sm' : 'text-zinc-600 hover:bg-white'}`}>{label}</Link>
          ))}
          <form action="/auth/signout" method="post"><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:bg-white">Sign out</button></form>
        </nav>
        <main className="md:col-span-3">{children}</main>
      </div>
      <Footer />
    </>
  );
}
