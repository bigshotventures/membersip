'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';
import { getProfile, requireProfile } from '@/lib/auth';
import { fireEvent } from '@/lib/events';
import { notify } from '@/lib/notify';
import { layout, sendEmail } from '@/lib/email';
import { int, list, str, strOrNull } from '@/lib/utils';

function back(path: string, msg?: string, key = 'notice'): never {
  revalidatePath(path);
  redirect(msg ? `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(msg)}` : path);
}

export async function joinWaitlist(fd: FormData) {
  const creatorId = str(fd, 'creator_id'), slug = str(fd, 'slug');
  const email = str(fd, 'email').toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) back(`/${slug}`, 'Please enter a valid email', 'error');
  const db = admin();
  const { error } = await db.from('waitlist').insert({ creator_id: creatorId, email, name: strOrNull(fd, 'name'), phone: strOrNull(fd, 'phone') });
  if (!error) {
    const { data: c } = await db.from('creators').select('name, theme, launch_at').eq('id', creatorId).single();
    await sendEmail({ to: email, subject: `You're on the list for ${c.name}`, creatorId, template: 'waitlist',
      html: layout({ title: "You're on the waitlist 🎉", body: `Thanks for joining! We'll email you the moment ${c.name} opens the doors — early members get the best launch pricing.`, brand: c.name, accent: c.theme?.accent }) });
    await fireEvent(creatorId, 'waitlist_joined', { email });
  }
  back(`/${slug}`, "You're on the list! We'll let you know at launch.");
}

export async function addComment(fd: FormData) {
  const p = await requireProfile();
  const sb = createClient();
  const body = str(fd, 'body').slice(0, 5000);
  const path = str(fd, 'path');
  if (!body) back(path);
  const { error } = await sb.from('comments').insert({
    creator_id: str(fd, 'creator_id'), target_type: str(fd, 'target_type'), target_id: str(fd, 'target_id'),
    parent_id: strOrNull(fd, 'parent_id'), author_id: p.id, body,
  });
  if (error) back(path, 'You can’t comment here right now', 'error');
  back(path);
}

export async function deleteComment(fd: FormData) {
  await requireProfile();
  await createClient().from('comments').delete().eq('id', str(fd, 'id'));
  back(str(fd, 'path'));
}

export async function toggleReaction(fd: FormData) {
  const p = await requireProfile();
  const sb = createClient();
  const key = { user_id: p.id, target_type: str(fd, 'target_type'), target_id: str(fd, 'target_id') };
  const { data } = await sb.from('reactions').select('user_id').match(key).maybeSingle();
  if (data) await sb.from('reactions').delete().match(key);
  else await sb.from('reactions').insert({ ...key, creator_id: str(fd, 'creator_id') });
  revalidatePath(str(fd, 'path'));
}

export async function votePoll(fd: FormData) {
  await requireProfile();
  const { error } = await createClient().rpc('vote_poll', { p: str(fd, 'poll_id'), opts: list(fd, 'option') });
  back(str(fd, 'path'), error ? error.message : undefined, 'error');
}

export async function createSpacePost(fd: FormData) {
  const p = await requireProfile();
  const sb = createClient();
  const path = str(fd, 'path');
  const body = str(fd, 'body').slice(0, 10000);
  if (!body) back(path);
  const creatorId = str(fd, 'creator_id');
  const announce = fd.get('announce') === 'on';
  const { data: post, error } = await sb.from('space_posts').insert({
    space_id: str(fd, 'space_id'), creator_id: creatorId, author_id: p.id, body, images: list(fd, 'images').slice(0, 10),
    is_announcement: announce, pinned: announce,
  }).select('id').single();
  if (error) back(path, 'You can’t post in this space', 'error');
  const question = str(fd, 'poll_question'), opts = str(fd, 'poll_options').split('\n').map((x) => x.trim()).filter(Boolean);
  if (question && opts.length >= 2) {
    const db = admin();
    const { data: poll } = await db.from('polls').insert({ creator_id: creatorId, space_post_id: post!.id, question }).select('id').single();
    await db.from('poll_options').insert(opts.slice(0, 10).map((label, i) => ({ poll_id: poll.id, label, position: i })));
  }
  if (announce) {
    const { data: s } = await admin().from('spaces').select('tier_ids, name, creator:creators(slug)').eq('id', str(fd, 'space_id')).single();
    const { notifyMembers } = await import('@/lib/notify');
    await notifyMembers(creatorId, s.tier_ids, { kind: 'announcement', title: `📣 New announcement in ${s.name}`, body: body.slice(0, 200), link: path, whatsapp: true });
  }
  back(path);
}

export async function deleteSpacePost(fd: FormData) {
  await requireProfile();
  await createClient().from('space_posts').delete().eq('id', str(fd, 'id'));
  back(str(fd, 'path'));
}

export async function reportContent(fd: FormData) {
  const p = await requireProfile();
  await createClient().from('reports').insert({ creator_id: str(fd, 'creator_id'), reporter_id: p.id, target_type: str(fd, 'target_type'), target_id: str(fd, 'target_id'), reason: str(fd, 'reason') || 'Inappropriate' });
  back(str(fd, 'path'), 'Thanks — our moderators will review it.');
}

export async function sendDM(fd: FormData) {
  const p = await requireProfile();
  const body = str(fd, 'body').slice(0, 4000);
  const creatorId = str(fd, 'creator_id'), memberId = strOrNull(fd, 'member_id') || p.id;
  const { error } = await createClient().from('direct_messages').insert({ creator_id: creatorId, member_id: memberId, sender_id: p.id, body });
  if (error) back(str(fd, 'path'), 'Messages are for active members', 'error');
  if (memberId !== p.id) {
    const { data: c } = await admin().from('creators').select('slug, name').eq('id', creatorId).single();
    await notify({ userId: memberId, creatorId, kind: 'dm', title: `New message from ${c.name}`, body: body.slice(0, 140), link: `/${c.slug}/messages` });
  } else {
    const { data: team } = await admin().from('creator_team').select('user_id, creator:creators(slug)').eq('creator_id', creatorId).in('role', ['owner', 'moderator']);
    for (const t of team || []) await notify({ userId: t.user_id, creatorId, kind: 'dm', title: `New message from ${p.full_name || 'a member'}`, body: body.slice(0, 140), link: `/studio/${(t as any).creator.slug}/messages?member=${p.id}`, email: false });
  }
  back(str(fd, 'path'));
}

export async function joinChallenge(fd: FormData) {
  const p = await requireProfile();
  const { error } = await createClient().from('challenge_participants').insert({ challenge_id: str(fd, 'challenge_id'), user_id: p.id });
  back(str(fd, 'path'), error ? 'This challenge is for members' : 'You’re in! Check in every day.', error ? 'error' : 'notice');
}

export async function checkIn(fd: FormData) {
  const p = await requireProfile();
  const challengeId = str(fd, 'challenge_id');
  const { error } = await createClient().from('challenge_checkins').insert({ challenge_id: challengeId, user_id: p.id, day: int(fd, 'day'), note: strOrNull(fd, 'note') });
  if (!error) {
    const { data: part } = await admin().from('challenge_participants').select('completed_at, challenge:challenges(creator_id)').eq('challenge_id', challengeId).eq('user_id', p.id).single();
    if (part?.completed_at && Date.now() - +new Date(part.completed_at) < 60000) await fireEvent((part as any).challenge.creator_id, 'challenge_completed', { userId: p.id, itemId: challengeId });
  }
  back(str(fd, 'path'), error ? 'Could not check in for that day' : 'Checked in! 🔥', error ? 'error' : 'notice');
}

export async function completeLesson(fd: FormData) {
  await requireProfile();
  const { data, error } = await createClient().rpc('complete_lesson', { lid: str(fd, 'lesson_id') });
  const path = str(fd, 'next') || str(fd, 'path');
  if (!error && data?.course_completed) {
    const p = await getProfile();
    const { data: l } = await admin().from('lessons').select('course:courses(id, creator_id)').eq('id', str(fd, 'lesson_id')).single();
    await fireEvent((l as any).course.creator_id, 'course_completed', { userId: p!.id, itemId: (l as any).course.id });
  }
  back(path, error ? error.message : data?.course_completed ? '🎉 Course completed! Your certificate is ready.' : undefined, error ? 'error' : 'notice');
}

export async function submitQuiz(fd: FormData) {
  await requireProfile();
  const n = int(fd, 'count');
  const answers = Array.from({ length: n }, (_, i) => int(fd, `q${i}`, -1));
  const { data, error } = await createClient().rpc('submit_quiz', { lid: str(fd, 'lesson_id'), answers });
  if (error) back(str(fd, 'path'), error.message, 'error');
  back(str(fd, 'path'), data.passed ? `Passed! ${data.score}/${data.total}` : `You scored ${data.score}/${data.total}. You need 70% to pass — try again.`, data.passed ? 'notice' : 'error');
}

export async function submitAssignment(fd: FormData) {
  const p = await requireProfile();
  const { error } = await createClient().from('submissions').upsert({
    assignment_id: str(fd, 'assignment_id'), user_id: p.id, body: strOrNull(fd, 'body'), file_path: strOrNull(fd, 'file_path'), submitted_at: new Date().toISOString(),
  }, { onConflict: 'assignment_id,user_id' });
  back(str(fd, 'path'), error ? 'Could not submit (already graded?)' : 'Assignment submitted ✔', error ? 'error' : 'notice');
}

export async function leaveReview(fd: FormData) {
  const p = await requireProfile();
  const rating = Math.min(5, Math.max(1, int(fd, 'rating', 5)));
  const { error } = await createClient().from('reviews').upsert({
    creator_id: str(fd, 'creator_id'), user_id: p.id, target_type: str(fd, 'target_type'), target_id: str(fd, 'target_id'), rating, body: strOrNull(fd, 'body'),
  }, { onConflict: 'user_id,target_type,target_id' });
  back(str(fd, 'path'), error ? 'Only members/buyers can review' : 'Thanks for your review!', error ? 'error' : 'notice');
}
