'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const GROUPS: [string, [string, string, string?][]][] = [
  ['', [['', '📊 Dashboard'], ['/members', '👥 Members'], ['/finance', '💰 Earnings & payouts', 'finance']]],
  ['Content', [['/posts', '📝 Posts'], ['/videos', '🎬 Videos'], ['/courses', '🎓 Courses & cohorts'], ['/live', '🎥 Live sessions'], ['/bookings', '📅 1:1 bookings'], ['/shop', '🛍 Shop & orders']]],
  ['Community', [['/community', '💬 Spaces'], ['/moderation', '🛡 Moderation', 'moderate'], ['/messages', '✉️ Messages', 'moderate'], ['/challenges', '🔥 Challenges'], ['/gamification', '🏅 Levels & badges'], ['/reviews', '⭐ Reviews']]],
  ['Growth', [['/tiers', '💎 Tiers & pricing'], ['/coupons', '🏷 Coupons'], ['/waitlist', '⏳ Waitlist'], ['/gifts', '🎁 Gifts'], ['/clips', '✂️ Preview clips'], ['/ab-tests', '🧪 A/B tests']]],
  ['Automation', [['/campaigns', '📣 Broadcasts'], ['/sequences', '📬 Sequences'], ['/automations', '⚡ Automations'], ['/integrations', '🔌 Webhooks & API']]],
  ['Account', [['/settings', '⚙️ Page settings'], ['/team', '🧑‍🤝‍🧑 Team'], ['/imports', '📥 Imports'], ['/services', '🤝 Done-for-you']]],
];

export function StudioNav({ slug, perms }: { slug: string; perms: Record<string, any> }) {
  const path = usePathname();
  const base = `/studio/${slug}`;
  const flat = GROUPS.flatMap(([, items]) => items).filter(([, , need]) => !need || perms[need]);
  return (
    <>
    <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t bg-white p-2 md:hidden">
      {flat.map(([href, label]) => {
        const full = base + href;
        const active = href === '' ? path === base : path.startsWith(full);
        return <Link key={href} href={full} className={cn('whitespace-nowrap rounded-md px-2 py-1 text-xs', active ? 'bg-zinc-900 text-white' : 'text-zinc-600')}>{label}</Link>;
      })}
    </nav>
    <nav className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r bg-white p-3 md:block">
      {GROUPS.map(([g, items]) => (
        <div key={g} className="mb-3">
          {g && <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{g}</div>}
          {items.filter(([, , need]) => !need || perms[need]).map(([href, label]) => {
            const full = base + href;
            const active = href === '' ? path === base : path.startsWith(full);
            return <Link key={href} href={full} className={cn('block rounded-md px-2 py-1.5 text-sm', active ? 'bg-zinc-100 font-semibold' : 'text-zinc-600 hover:bg-zinc-50')}>{label}</Link>;
          })}
        </div>
      ))}
    </nav>
    </>
  );
}
