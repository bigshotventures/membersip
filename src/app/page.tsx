import Link from 'next/link';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Footer } from '@/components/layout/Footer';
import { admin } from '@/lib/supabase/admin';
import { APP_NAME } from '@/lib/utils';
import { Avatar } from '@/components/ui';

export const revalidate = 300;

const FEATURES = [
  ['Memberships', 'Monthly, quarterly, yearly and lifetime tiers with UPI Autopay, trials, coupons and gift cards.'],
  ['Courses & cohorts', 'Modules, drip release, quizzes, assignments, certificates and batch-wise cohorts.'],
  ['Live on Zoom', 'Members join live sessions and 1:1 calls right inside the platform, with automatic reminders.'],
  ['Community', 'Spaces, chat, polls, challenges, streaks, badges and a leaderboard to keep members engaged.'],
  ['Shop', 'Ebooks, templates, recorded workshops, pay-per-view drops and merch for top tiers.'],
  ['Protected content', 'Signed video streaming with a moving watermark and PDFs stamped with the buyer\'s name.'],
  ['Email & WhatsApp', 'Reminders, sequences, broadcasts and automations that run on their own.'],
  ['GST ready', 'Automatic GST invoices, GSTR-ready reports and DPDP-compliant data handling.'],
];

export default async function Home() {
  const { data: creators } = await admin().from('creators').select('slug, name, tagline, avatar_url, verified').eq('status', 'live').order('created_at').limit(12);
  return (
    <>
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-b from-brand-50 to-zinc-50">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center">
            <h1 className="mx-auto max-w-3xl text-4xl font-extrabold sm:text-5xl">Your community, courses and live sessions — one membership.</h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-600">{APP_NAME} gives creators a beautiful home for paid memberships. Our team sets everything up and runs it for you; you see every number from your dashboard.</p>
            <div className="mt-8 flex justify-center gap-3">
              <a href="mailto:hello@example.com?subject=Launch%20my%20membership" className="btn-primary px-6 py-3 text-base">Launch your membership</a>
              <Link href="/login" className="btn-outline px-6 py-3 text-base">Member sign in</Link>
            </div>
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([t, d]) => (
            <div key={t} className="card p-5">
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-zinc-600">{d}</p>
            </div>
          ))}
        </section>
        {!!creators?.length && (
          <section className="mx-auto max-w-6xl px-4 pb-10">
            <h2 className="mb-4 text-xl font-bold">Creators on {APP_NAME}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {creators.map((c: any) => (
                <Link key={c.slug} href={`/${c.slug}`} className="card flex items-center gap-3 p-4 hover:shadow-md">
                  <Avatar src={c.avatar_url} name={c.name} size={48} />
                  <div>
                    <div className="font-semibold">{c.name} {c.verified && <span title="Verified" className="text-sky-500">✔</span>}</div>
                    <div className="text-sm text-zinc-500">{c.tagline}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
