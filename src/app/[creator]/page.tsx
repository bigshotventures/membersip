import Link from 'next/link';
import type { Metadata } from 'next';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { accessCtx, canSee } from '@/lib/access';
import { pricingVariant } from '@/lib/ab';
import { TierCards } from '@/components/creator/TierCards';
import { PostCard } from '@/components/creator/PostCard';
import { Flash } from '@/components/creator/Flash';
import { VideoPlayer } from '@/components/VideoPlayer';
import { Markdown } from '@/components/Markdown';
import { Avatar, Empty } from '@/components/ui';
import { Countdown, SubmitButton } from '@/components/client';
import { joinWaitlist, leaveReview } from '@/actions/member';
import { fmtDate, fmtTime } from '@/lib/utils';

export async function generateMetadata({ params }: { params: { creator: string } }): Promise<Metadata> {
  const { data: c } = await admin().from('creators').select('name, tagline, banner_url, avatar_url').eq('slug', params.creator).maybeSingle();
  if (!c) return {};
  return { title: c.name, description: c.tagline, openGraph: { title: c.name, description: c.tagline || undefined, images: c.banner_url || c.avatar_url ? [c.banner_url || c.avatar_url] : [] } };
}

export default async function Storefront({ params, searchParams }: { params: { creator: string }; searchParams: { page?: string; notice?: string; error?: string; welcome?: string } }) {
  const { creator, profile, membership, isMember, perms } = await loadCreatorPage(params.creator);
  const db = admin();
  const page = Math.max(1, Number(searchParams.page) || 1), per = 12;
  const [{ data: tiers }, { data: posts }, { data: lives }, { data: reviews }, ctx, variant, { data: intro }] = await Promise.all([
    db.from('tiers').select('*').eq('creator_id', creator.id).eq('is_active', true).order('position'),
    db.from('posts').select('*').eq('creator_id', creator.id).eq('status', 'published').order('pinned', { ascending: false }).order('published_at', { ascending: false }).range((page - 1) * per, page * per),
    db.from('live_sessions').select('id, title, starts_at').eq('creator_id', creator.id).eq('status', 'scheduled').gte('starts_at', new Date().toISOString()).order('starts_at').limit(3),
    db.from('reviews').select('*, user:profiles(full_name, avatar_url)').eq('creator_id', creator.id).eq('target_type', 'creator').eq('hidden', false).order('created_at', { ascending: false }).limit(6),
    accessCtx(profile?.id, creator.id, membership, perms.view),
    pricingVariant(creator.id),
    creator.intro_video_id ? db.from('videos').select('id, is_public').eq('id', creator.intro_video_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const postIds = (posts || []).slice(0, per).map((p: any) => p.id);
  const [{ data: likeRows }, { data: commentRows }] = await Promise.all([
    postIds.length ? db.from('reactions').select('target_id').eq('target_type', 'post').in('target_id', postIds) : Promise.resolve({ data: [] }),
    postIds.length ? db.from('comments').select('target_id').eq('target_type', 'post').in('target_id', postIds).eq('hidden', false) : Promise.resolve({ data: [] }),
  ]);
  const count = (rows: any[] | null, id: string) => (rows || []).filter((r) => r.target_id === id).length;
  const avg = reviews?.length ? (reviews.reduce((a: number, r: any) => a + r.rating, 0) / reviews.length).toFixed(1) : null;
  const isWaitlist = creator.status === 'waitlist';

  return (
    <div className="space-y-10">
      <Flash sp={searchParams} />
      {searchParams.welcome && <div className="card accent-bg p-5 text-white"><b>Welcome aboard! 🎉</b> Your membership is active. Explore the posts below, join the community and check upcoming lives.</div>}

      <section className="card overflow-hidden">
        {creator.banner_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={creator.banner_url} alt="" className="h-48 w-full object-cover sm:h-64" />
          : <div className="h-32 accent-bg opacity-80" />}
        <div className="flex flex-wrap items-end gap-4 px-6 pb-6">
          <div className="-mt-10 rounded-full border-4 border-white"><Avatar src={creator.avatar_url} name={creator.name} size={88} /></div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{creator.name} {creator.verified && <span className="text-sky-500" title="Verified">✔</span>}</h1>
            {creator.tagline && <p className="text-zinc-600">{creator.tagline}</p>}
            {avg && <p className="mt-1 text-sm text-zinc-500">★ {avg} · {reviews!.length} reviews</p>}
          </div>
          <div className="flex gap-2">
            {Object.entries(creator.socials || {}).filter(([, v]) => v).map(([k, v]) => (
              <a key={k} href={String(v)} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm capitalize">{k}</a>
            ))}
          </div>
        </div>
      </section>

      {isMember && membership && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm">You're a <b>{membership.tier?.name}</b> member{membership.status === 'trialing' && ' (free trial)'}{membership.status === 'past_due' && <span className="badge-amber ml-2">Payment due — update in Billing</span>}</div>
          <div className="flex gap-2">
            <Link href={`/${creator.slug}/community`} className="btn-outline btn-sm">Community</Link>
            <Link href={`/${creator.slug}/gift`} className="btn-outline btn-sm">🎁 Gift a membership</Link>
            <Link href="/account/billing" className="btn-ghost btn-sm">Manage</Link>
          </div>
        </div>
      )}

      {isWaitlist && (
        <section className="card accent-bg overflow-hidden p-8 text-white">
          <h2 className="text-2xl font-bold">Launching {creator.launch_at ? fmtDate(creator.launch_at) : 'soon'}</h2>
          <p className="mt-1 opacity-90">Join the waitlist to get early-bird pricing and a launch-day invite.</p>
          {creator.launch_at && <div className="mt-5"><Countdown to={creator.launch_at} /></div>}
          <form action={joinWaitlist} className="mt-6 flex max-w-lg flex-wrap gap-2">
            <input type="hidden" name="creator_id" value={creator.id} />
            <input type="hidden" name="slug" value={creator.slug} />
            <input name="name" placeholder="Your name" className="input flex-1 text-zinc-900" />
            <input name="email" type="email" required placeholder="Email" className="input flex-1 text-zinc-900" />
            <SubmitButton className="btn bg-white text-zinc-900 hover:bg-zinc-100">Join waitlist</SubmitButton>
          </form>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {(intro as any)?.is_public ? <VideoPlayer videoId={creator.intro_video_id} context={{ type: 'public' }} title={`${creator.name} intro`} accent={creator.theme?.accent} /> : null}
          {creator.bio && <div className="card p-6"><h2 className="mb-2 font-semibold">About</h2><Markdown>{creator.bio}</Markdown></div>}
        </div>
        <aside className="space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 font-semibold">Upcoming live sessions</h3>
            {lives?.length ? lives.map((l: any) => (
              <Link key={l.id} href={`/${creator.slug}/live/${l.id}`} className="block rounded-lg p-2 hover:bg-zinc-50">
                <div className="text-sm font-medium">{l.title}</div>
                <div className="text-xs text-zinc-500">{fmtDate(l.starts_at)} · {fmtTime(l.starts_at)}</div>
              </Link>
            )) : <p className="text-sm text-zinc-500">Nothing scheduled yet.</p>}
          </div>
        </aside>
      </div>

      {(!isMember || membership) && !!tiers?.length && (
        <section id="join">
          <h2 className="mb-2 text-center text-2xl font-bold">{variant?.headline || (isMember ? 'Change your tier' : 'Choose your membership')}</h2>
          <p className="mb-6 text-center text-sm text-zinc-500">Pay with UPI Autopay, cards or netbanking. Cancel anytime.</p>
          <TierCards tiers={tiers as any} slug={creator.slug} currentTierId={membership?.hasAccess ? membership.tier_id : null} abTestId={variant?.testId} names={variant?.tier_names} disabled={isWaitlist} />
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-bold">Posts</h2>
        {posts?.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {posts.slice(0, per).map((p: any) => <PostCard key={p.id} post={p} slug={creator.slug} unlocked={canSee(p, ctx)} likes={count(likeRows, p.id)} comments={count(commentRows, p.id)} />)}
          </div>
        ) : <Empty title="No posts yet" />}
        <div className="mt-4 flex justify-between">
          {page > 1 ? <Link href={`/${creator.slug}?page=${page - 1}`} className="btn-outline btn-sm">← Newer</Link> : <span />}
          {(posts?.length || 0) > per && <Link href={`/${creator.slug}?page=${page + 1}`} className="btn-outline btn-sm">Older →</Link>}
        </div>
      </section>

      {(creator.testimonials?.length > 0 || reviews?.length || membership?.hasAccess) && (
        <section>
          <h2 className="mb-4 text-xl font-bold">What members say</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {(creator.testimonials || []).map((t: any, i: number) => (
              <figure key={`t${i}`} className="card p-5"><blockquote className="text-sm text-zinc-700">“{t.quote}”</blockquote><figcaption className="mt-3 text-sm font-medium">{t.name}</figcaption></figure>
            ))}
            {(reviews || []).map((r: any) => (
              <figure key={r.id} className="card p-5">
                <div className="text-amber-500">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                {r.body && <blockquote className="mt-2 text-sm text-zinc-700">{r.body}</blockquote>}
                <figcaption className="mt-3 flex items-center gap-2 text-sm"><Avatar src={r.user?.avatar_url} name={r.user?.full_name} size={24} />{r.user?.full_name}</figcaption>
                {r.reply && <p className="mt-2 rounded bg-zinc-50 p-2 text-xs"><b>{creator.name}:</b> {r.reply}</p>}
              </figure>
            ))}
          </div>
          {membership?.hasAccess && (
            <form action={leaveReview} className="card mt-4 flex flex-wrap items-end gap-3 p-4">
              <input type="hidden" name="creator_id" value={creator.id} /><input type="hidden" name="target_type" value="creator" />
              <input type="hidden" name="target_id" value={creator.id} /><input type="hidden" name="path" value={`/${creator.slug}`} />
              <label className="text-sm">Rating<select name="rating" className="input mt-1 w-24" defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}</select></label>
              <input name="body" className="input flex-1" placeholder="Share your experience" maxLength={1000} />
              <SubmitButton className="btn-dark">Post review</SubmitButton>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
