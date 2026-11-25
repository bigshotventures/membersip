'use server';
import { studioCtx, done } from '@/lib/studio';
import { bool, int, istLocalToISO, lines, list, str, strOrNull, toPaise, slugify } from '@/lib/utils';
import { announcePost } from '@/lib/posts';
import { layout, sendEmail } from '@/lib/email';
import { createClip, deleteAsset } from '@/lib/mux';
import { APP_URL } from '@/lib/utils';

/* ───────── Page settings ───────── */
export async function saveSettings(fd: FormData) {
  const { creator, db, slug, log } = await studioCtx(fd);
  const testimonials = lines(str(fd, 'testimonials')).map((l) => { const [name, ...q] = l.split('|'); return { name: name.trim(), quote: q.join('|').trim() }; }).filter((t) => t.name && t.quote);
  const socials = Object.fromEntries(['instagram', 'youtube', 'twitter', 'linkedin', 'website', 'telegram'].map((k) => [k, strOrNull(fd, `social_${k}`)]).filter(([, v]) => v));
  await db.from('creators').update({
    name: str(fd, 'name'), tagline: strOrNull(fd, 'tagline'), bio: strOrNull(fd, 'bio'), category: strOrNull(fd, 'category'),
    avatar_url: strOrNull(fd, 'avatar_url'), banner_url: strOrNull(fd, 'banner_url'), intro_video_id: strOrNull(fd, 'intro_video_id'),
    theme: { ...creator.theme, accent: str(fd, 'accent') || '#7c3aed' }, socials, testimonials,
    whatsapp_group_link: strOrNull(fd, 'whatsapp_group_link'), launch_at: istLocalToISO(fd.get('launch_at')),
    settings: { ...creator.settings, cancel_offer_pct: int(fd, 'cancel_offer_pct', 20), pause_max_months: int(fd, 'pause_max_months', 3), winback_days: int(fd, 'winback_days', 7), winback_pct: int(fd, 'winback_pct', 30) },
  }).eq('id', creator.id);
  await log('settings.update');
  done(slug, '/settings', 'Saved');
}

/* ───────── Tiers ───────── */
export async function saveTier(fd: FormData) {
  const { creator, db, slug, log } = await studioCtx(fd);
  const id = strOrNull(fd, 'id');
  const row = {
    creator_id: creator.id, name: str(fd, 'name'), description: strOrNull(fd, 'description'), perks: lines(str(fd, 'perks')),
    price_monthly: toPaise(fd.get('price_monthly')), price_quarterly: toPaise(fd.get('price_quarterly')),
    price_yearly: toPaise(fd.get('price_yearly')), price_lifetime: toPaise(fd.get('price_lifetime')),
    trial_days: int(fd, 'trial_days'), position: int(fd, 'position'), is_featured: bool(fd, 'is_featured'), is_active: !bool(fd, 'archived'),
    whatsapp_group_link: strOrNull(fd, 'whatsapp_group_link'), merch_discount_pct: Math.min(90, int(fd, 'merch_discount_pct')),
  };
  if (![row.price_monthly, row.price_quarterly, row.price_yearly, row.price_lifetime].some((p) => p)) throw new Error('Set at least one price');
  if (id) await db.from('tiers').update(row).eq('id', id).eq('creator_id', creator.id);
  else await db.from('tiers').insert(row);
  await log(id ? 'tier.update' : 'tier.create', 'tier', id || undefined);
  done(slug, '/tiers', 'Tier saved. Existing subscribers keep their current price; new prices apply to new sign-ups.');
}

/* ───────── Coupons ───────── */
export async function saveCoupon(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const kind = str(fd, 'kind') === 'flat' ? 'flat' : 'percent';
  const value = kind === 'flat' ? toPaise(fd.get('value')) : int(fd, 'value');
  const { error } = await db.from('coupons').insert({
    creator_id: creator.id, code: str(fd, 'code').toUpperCase().replace(/\s/g, ''), kind, value,
    applies_to: str(fd, 'applies_to') || 'any', max_redemptions: int(fd, 'max_redemptions') || null, expires_at: istLocalToISO(fd.get('expires_at')),
  });
  if (error) done(slug, '/coupons', error.code === '23505' ? 'That code already exists' : error.message);
  done(slug, '/coupons', 'Coupon created');
}
export async function toggleCoupon(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('coupons').update({ active: bool(fd, 'active') }).eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/coupons');
}

/* ───────── Posts ───────── */
export async function savePost(fd: FormData) {
  const { creator, db, slug, profile, log } = await studioCtx(fd);
  const id = strOrNull(fd, 'id');
  const action = str(fd, 'action'); // draft | publish | schedule
  const publishAt = istLocalToISO(fd.get('publish_at'));
  const status = action === 'publish' ? 'published' : action === 'schedule' && publishAt ? 'scheduled' : 'draft';
  const visibility = str(fd, 'visibility') || 'members';
  const attachments = list(fd, 'attachment_path').map((path) => ({ name: path.split('/').pop()!.replace(/^[a-f0-9]{8}-/, ''), path, stamp: true }));
  const row: any = {
    creator_id: creator.id, title: str(fd, 'title'), excerpt: strOrNull(fd, 'excerpt'), cover_url: strOrNull(fd, 'cover_url'),
    kind: str(fd, 'kind') || 'text', visibility, tier_ids: list(fd, 'tier_ids'), ppv_price_paise: visibility === 'ppv' ? toPaise(fd.get('ppv_price')) : null,
    pinned: bool(fd, 'pinned'), status, publish_at: status === 'scheduled' ? publishAt : null,
  };
  if (visibility === 'ppv' && !row.ppv_price_paise) throw new Error('Set a price for pay-per-view posts');
  let postId = id;
  if (id) await db.from('posts').update(row).eq('id', id).eq('creator_id', creator.id);
  else postId = (await db.from('posts').insert({ ...row, author_id: profile.id }).select('id').single()).data.id;
  await db.from('post_bodies').upsert({ post_id: postId, body: str(fd, 'body'), images: list(fd, 'images'), video_id: strOrNull(fd, 'video_id'), attachments }, { onConflict: 'post_id' });

  const question = str(fd, 'poll_question'), opts = lines(str(fd, 'poll_options'));
  const { data: existingPoll } = await db.from('polls').select('id').eq('post_id', postId).maybeSingle();
  if (question && opts.length >= 2 && !existingPoll) {
    const { data: poll } = await db.from('polls').insert({ creator_id: creator.id, post_id: postId, question, multiple: bool(fd, 'poll_multiple') }).select('id').single();
    await db.from('poll_options').insert(opts.slice(0, 10).map((label, i) => ({ poll_id: poll.id, label, position: i })));
  }
  if (status === 'published') await announcePost(postId!);
  await log(`post.${status}`, 'post', postId!);
  done(slug, '/posts', status === 'published' ? 'Published and members notified' : status === 'scheduled' ? 'Scheduled' : 'Draft saved');
}

export async function deletePost(fd: FormData) {
  const { creator, db, slug, log } = await studioCtx(fd);
  await db.from('posts').delete().eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  await log('post.delete', 'post', str(fd, 'id'));
  done(slug, '/posts', 'Post deleted');
}

/* ───────── Videos ───────── */
export async function deleteVideo(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const { data: v } = await db.from('videos').select('*').eq('id', str(fd, 'id')).eq('creator_id', creator.id).single();
  if (v?.mux_asset_id) await deleteAsset(v.mux_asset_id).catch(() => null);
  await db.from('videos').delete().eq('id', v.id);
  done(slug, '/videos', 'Video deleted');
}
export async function renameVideo(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('videos').update({ title: str(fd, 'title'), is_public: bool(fd, 'is_public') }).eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/videos');
}

/* ───────── Preview clips ───────── */
export async function saveClip(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const { data: src } = await db.from('videos').select('*').eq('id', str(fd, 'source_video_id')).eq('creator_id', creator.id).single();
  if (!src?.mux_asset_id || src.status !== 'ready') throw new Error('Pick a video that has finished processing');
  const start = Number(fd.get('start_s')) || 0, end = Number(fd.get('end_s')) || 30;
  if (end <= start || end - start > 180) throw new Error('Clips must be between 1 second and 3 minutes');
  const title = str(fd, 'title');
  const { data: v } = await db.from('videos').insert({ creator_id: creator.id, title: `Clip: ${title}`, is_public: true, status: 'processing' }).select('id').single();
  const asset = await createClip(src.mux_asset_id, start, end, v.id);
  await db.from('videos').update({ mux_asset_id: asset.id }).eq('id', v.id);
  await db.from('preview_clips').insert({
    creator_id: creator.id, source_video_id: src.id, clip_video_id: v.id, slug: slugify(title) || v.id.slice(0, 8), title,
    caption: strOrNull(fd, 'caption'), start_s: start, end_s: end, cta_label: str(fd, 'cta_label') || 'Join to watch the full video',
  });
  done(slug, '/clips', 'Clip is processing — share the link once it shows Ready');
}

/* ───────── Waitlist ───────── */
export async function emailWaitlist(fd: FormData) {
  const { creator, db, slug, log } = await studioCtx(fd);
  const { data: rows } = await db.from('waitlist').select('*').eq('creator_id', creator.id).is('notified_at', null);
  const subject = str(fd, 'subject') || `${creator.name} is open!`;
  for (const w of rows || []) {
    await sendEmail({ to: w.email, subject, creatorId: creator.id, template: 'waitlist_launch',
      html: layout({ title: subject, body: str(fd, 'body') || `The doors are open. As a waitlist member you get first access.`, cta: { label: 'Join now', url: `${APP_URL}/${creator.slug}#join` }, brand: creator.name, accent: creator.theme?.accent }) });
    await db.from('waitlist').update({ notified_at: new Date().toISOString() }).eq('id', w.id);
  }
  await log('waitlist.email', undefined, undefined, { count: rows?.length });
  done(slug, '/waitlist', `Emailed ${rows?.length || 0} people`);
}

/* ───────── Reviews ───────── */
export async function moderateReview(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd, 'moderate');
  await db.from('reviews').update({ reply: strOrNull(fd, 'reply'), hidden: bool(fd, 'hidden') }).eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/reviews', 'Review updated');
}

/* ───────── A/B tests ───────── */
export async function saveAbTest(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const { data: tiers } = await db.from('tiers').select('id').eq('creator_id', creator.id);
  const variants = ['A', 'B'].map((k) => ({
    key: k, headline: strOrNull(fd, `headline_${k}`),
    tier_names: Object.fromEntries((tiers || []).map((t: any) => [t.id, strOrNull(fd, `name_${k}_${t.id}`)]).filter(([, v]) => v)),
  }));
  await db.from('ab_tests').update({ status: 'stopped' }).eq('creator_id', creator.id).eq('status', 'running');
  await db.from('ab_tests').insert({ creator_id: creator.id, name: str(fd, 'name') || 'Pricing test', variants });
  done(slug, '/ab-tests', 'Test started — visitors are split 50/50');
}
export async function stopAbTest(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('ab_tests').update({ status: 'stopped', winner: strOrNull(fd, 'winner') }).eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/ab-tests', 'Test stopped');
}
