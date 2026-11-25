import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadCreatorPage } from '@/lib/public';
import { admin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { Markdown } from '@/components/Markdown';
import { VideoPlayer } from '@/components/VideoPlayer';
import { ZoomEmbed } from '@/components/ZoomEmbed';
import { Countdown } from '@/components/client';
import { Comments } from '@/components/creator/Social';
import { fmtDate, fmtTime, inr } from '@/lib/utils';

export default async function LivePage({ params }: { params: { creator: string; id: string } }) {
  const { creator, profile, membership, perms } = await loadCreatorPage(params.creator);
  const { data: l } = await admin().from('live_sessions').select('*').eq('id', params.id).eq('creator_id', creator.id).maybeSingle();
  if (!l) notFound();
  const { data: access } = profile ? await createClient().rpc('can_access_live', { s: l.id }) : { data: l.visibility === 'public' };
  const start = new Date(l.starts_at), end = new Date(start.getTime() + l.duration_min * 60000);
  const now = Date.now();
  const joinable = now >= start.getTime() - 15 * 60000 && now <= end.getTime() + 60 * 60000 && l.status !== 'ended';
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(l.title)}&dates=${start.toISOString().replace(/[-:]|\.\d{3}/g, '')}/${end.toISOString().replace(/[-:]|\.\d{3}/g, '')}&details=${encodeURIComponent(`Join: ${process.env.NEXT_PUBLIC_APP_URL}/${creator.slug}/live/${l.id}`)}`;
  const path = `/${creator.slug}/live/${l.id}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={`/${creator.slug}/live`} className="text-sm text-zinc-500 hover:underline">← Live sessions</Link>
      <div>
        <div className="flex items-center gap-2">{l.status === 'live' && <span className="badge-red">● LIVE NOW</span>}{l.status === 'cancelled' && <span className="badge-red">Cancelled</span>}</div>
        <h1 className="text-3xl font-bold">{l.title}</h1>
        <p className="mt-1 text-zinc-500">{fmtDate(l.starts_at)} · {fmtTime(l.starts_at)} – {fmtTime(end)} IST</p>
      </div>

      {l.recording_video_id && access ? (
        <VideoPlayer videoId={l.recording_video_id} context={{ type: 'live', id: l.id }} title={l.title} accent={creator.theme?.accent} />
      ) : access ? (
        <div className="card space-y-4 p-6">
          {joinable ? (
            <>
              <p className="text-sm text-zinc-600">The session opens right here — no Zoom app needed. Allow camera/microphone if asked.</p>
              <ZoomEmbed liveId={l.id} label={l.status === 'live' ? 'Join live now' : 'Join session'} />
            </>
          ) : now < start.getTime() ? (
            <div className="accent-bg -m-6 rounded-xl p-6 text-white">
              <p className="mb-3 font-medium">Starts in</p>
              <Countdown to={l.starts_at} />
              <div className="mt-5 flex flex-wrap gap-2">
                <a href={gcal} target="_blank" rel="noreferrer" className="btn bg-white text-zinc-900">Add to Google Calendar</a>
                <Link href={`/${creator.slug}/events`} className="btn border border-white/40 text-white">Sync all events</Link>
              </div>
              <p className="mt-3 text-sm opacity-80">We'll remind you 24 hours and 15 minutes before by email{profile?.whatsapp_opt_in ? ' and WhatsApp' : ''}.</p>
            </div>
          ) : <p className="text-zinc-500">This session has ended. {l.publish_recording ? 'The replay will appear here once it has processed.' : ''}</p>}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-lg font-medium">{l.visibility === 'ppv' ? 'This is a ticketed live event' : 'This live session is for members'}</p>
          <div className="mt-4 flex justify-center gap-2">
            {l.visibility === 'ppv' && l.ticket_price_paise && <Link href={`/${creator.slug}/checkout?kind=event&item=${l.id}`} className="btn-primary">Buy ticket · {inr(l.ticket_price_paise)}</Link>}
            <Link href={`/${creator.slug}#join`} className={l.visibility === 'ppv' ? 'btn-outline' : 'btn-primary'}>{membership?.hasAccess ? 'Upgrade tier' : 'Become a member'}</Link>
          </div>
        </div>
      )}

      {perms.moderate && <p className="text-sm"><Link className="underline" href={`/studio/${creator.slug}/live`}>Host controls →</Link></p>}
      <Markdown>{l.description}</Markdown>
      {access && <Comments creatorId={creator.id} targetType="live" targetId={l.id} path={path} viewerId={profile?.id} canComment={!!profile} canModerate={perms.moderate} />}
    </div>
  );
}
