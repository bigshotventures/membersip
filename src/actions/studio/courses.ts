'use server';
import { studioCtx, done } from '@/lib/studio';
import { bool, int, istLocalToISO, lines, list, slugify, str, strOrNull, toPaise } from '@/lib/utils';
import { notify, notifyMembers } from '@/lib/notify';
import { createMeeting, deleteMeeting, getStartUrl, updateMeeting } from '@/lib/zoom';
import { redirect } from 'next/navigation';

/* ───────── Courses ───────── */
export async function saveCourse(fd: FormData) {
  const { creator, db, slug, log } = await studioCtx(fd);
  const id = strOrNull(fd, 'id');
  const row = {
    creator_id: creator.id, title: str(fd, 'title'), slug: slugify(str(fd, 'course_slug') || str(fd, 'title')), subtitle: strOrNull(fd, 'subtitle'),
    description: strOrNull(fd, 'description'), cover_url: strOrNull(fd, 'cover_url'), price_paise: toPaise(fd.get('price')),
    tier_ids: list(fd, 'tier_ids'), is_cohort: bool(fd, 'is_cohort'), certificate_enabled: bool(fd, 'certificate_enabled'),
    status: str(fd, 'status') || 'draft', position: int(fd, 'position'),
  };
  if (row.price_paise === null && !row.tier_ids.length && !row.is_cohort) throw new Error('Set a price, include it in a tier, or make it a cohort course');
  let courseId = id;
  if (id) await db.from('courses').update(row).eq('id', id).eq('creator_id', creator.id);
  else {
    const { data, error } = await db.from('courses').insert(row).select('id').single();
    if (error) throw new Error(error.code === '23505' ? 'A course with this URL already exists' : error.message);
    courseId = data.id;
    await db.from('course_modules').insert({ course_id: courseId, title: 'Module 1', position: 0 });
  }
  await log(id ? 'course.update' : 'course.create', 'course', courseId!);
  done(slug, `/courses/${courseId}`, 'Course saved');
}

export async function deleteCourse(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('courses').delete().eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/courses', 'Course deleted');
}

async function ownCourse(db: any, creatorId: string, courseId: string) {
  const { data } = await db.from('courses').select('id').eq('id', courseId).eq('creator_id', creatorId).single();
  if (!data) throw new Error('Course not found');
}

export async function saveModule(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const courseId = str(fd, 'course_id');
  await ownCourse(db, creator.id, courseId);
  const id = strOrNull(fd, 'id');
  if (id) await db.from('course_modules').update({ title: str(fd, 'title'), position: int(fd, 'position') }).eq('id', id).eq('course_id', courseId);
  else await db.from('course_modules').insert({ course_id: courseId, title: str(fd, 'title'), position: int(fd, 'position', 99) });
  done(slug, `/courses/${courseId}`);
}
export async function deleteModule(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const courseId = str(fd, 'course_id');
  await ownCourse(db, creator.id, courseId);
  await db.from('course_modules').delete().eq('id', str(fd, 'id')).eq('course_id', courseId);
  done(slug, `/courses/${courseId}`, 'Module deleted');
}

export async function saveLesson(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const courseId = str(fd, 'course_id');
  await ownCourse(db, creator.id, courseId);
  const id = strOrNull(fd, 'id');
  const kind = str(fd, 'kind') || 'video';
  const row = {
    course_id: courseId, module_id: str(fd, 'module_id'), title: str(fd, 'title'), kind, drip_days: int(fd, 'drip_days'),
    is_preview: bool(fd, 'is_preview'), position: int(fd, 'position'), duration_s: int(fd, 'duration_min') * 60 || null,
  };
  let lessonId = id;
  if (id) await db.from('lessons').update(row).eq('id', id).eq('course_id', courseId);
  else lessonId = (await db.from('lessons').insert(row).select('id').single()).data.id;
  await db.from('lesson_contents').upsert({
    lesson_id: lessonId, body: str(fd, 'body'), video_id: strOrNull(fd, 'video_id'), file_path: strOrNull(fd, 'file_path'), stamp_pdf: bool(fd, 'stamp_pdf'),
  }, { onConflict: 'lesson_id' });

  if (kind === 'quiz') {
    // Format: question line, then options each starting with "-" ; mark the right one with "*"
    const blocks = str(fd, 'quiz').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const qs = blocks.map((b, i) => {
      const [q, ...opts] = b.split('\n').map((x) => x.trim());
      const options = opts.map((o) => o.replace(/^[-*]\s*|\s*\*$/g, '').replace(/^\*\s*/, ''));
      const correct = opts.findIndex((o) => o.startsWith('*') || o.endsWith('*'));
      return { lesson_id: lessonId, question: q, options, correct_index: Math.max(0, correct), position: i };
    }).filter((q) => q.question && q.options.length >= 2);
    await db.from('quiz_questions').delete().eq('lesson_id', lessonId);
    if (qs.length) await db.from('quiz_questions').insert(qs);
  }
  if (kind === 'assignment') {
    const { data: a } = await db.from('assignments').select('id').eq('lesson_id', lessonId).maybeSingle();
    const arow = { lesson_id: lessonId, instructions: str(fd, 'instructions'), due_at: istLocalToISO(fd.get('due_at')), max_score: int(fd, 'max_score', 10) };
    if (a) await db.from('assignments').update(arow).eq('id', a.id); else await db.from('assignments').insert(arow);
  }
  done(slug, `/courses/${courseId}`, 'Lesson saved');
}
export async function deleteLesson(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const courseId = str(fd, 'course_id');
  await ownCourse(db, creator.id, courseId);
  await db.from('lessons').delete().eq('id', str(fd, 'id')).eq('course_id', courseId);
  done(slug, `/courses/${courseId}`, 'Lesson deleted');
}

export async function saveCohort(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const courseId = str(fd, 'course_id');
  await ownCourse(db, creator.id, courseId);
  const name = str(fd, 'name');
  const { data: h } = await db.from('cohorts').insert({
    course_id: courseId, name, starts_at: istLocalToISO(fd.get('starts_at')), ends_at: istLocalToISO(fd.get('ends_at')),
    enroll_closes_at: istLocalToISO(fd.get('enroll_closes_at')), capacity: int(fd, 'capacity') || null, price_paise: toPaise(fd.get('price')),
  }).select('id').single();
  const { data: course } = await db.from('courses').select('title').eq('id', courseId).single();
  const { data: space } = await db.from('spaces').insert({ creator_id: creator.id, name: `${course.title} · ${name}`, description: 'Private space for this batch', cohort_id: h.id, position: 100 }).select('id').single();
  await db.from('cohorts').update({ space_id: space.id }).eq('id', h.id);
  done(slug, `/courses/${courseId}`, 'Batch created with its own private community space');
}

export async function gradeSubmission(fd: FormData) {
  const { profile, db, slug, creator } = await studioCtx(fd, 'moderate');
  const { data: s } = await db.from('submissions').select('*, assignment:assignments(lesson:lessons(title, course:courses(creator_id, slug)))').eq('id', str(fd, 'id')).single();
  if (s?.assignment?.lesson?.course?.creator_id !== creator.id) throw new Error('Not found');
  await db.from('submissions').update({ score: int(fd, 'score'), feedback: strOrNull(fd, 'feedback'), graded_by: profile.id, graded_at: new Date().toISOString() }).eq('id', s.id);
  await notify({ userId: s.user_id, creatorId: creator.id, kind: 'graded', title: `Your assignment "${s.assignment.lesson.title}" was graded`, body: `Score: ${int(fd, 'score')}`, link: `/${creator.slug}/courses/${s.assignment.lesson.course.slug}` });
  done(slug, `/courses/${str(fd, 'course_id')}?tab=submissions`, 'Graded');
}

/* ───────── Live sessions ───────── */
export async function saveLive(fd: FormData) {
  const { creator, db, slug, log } = await studioCtx(fd);
  const id = strOrNull(fd, 'id');
  const startsAt = istLocalToISO(fd.get('starts_at'));
  if (!startsAt) throw new Error('Pick a start time');
  const visibility = str(fd, 'visibility') || 'members';
  const row = {
    creator_id: creator.id, title: str(fd, 'title'), description: strOrNull(fd, 'description'), starts_at: startsAt,
    duration_min: int(fd, 'duration_min', 60), visibility, tier_ids: list(fd, 'tier_ids'),
    ticket_price_paise: visibility === 'ppv' ? toPaise(fd.get('ticket_price')) : null, publish_recording: bool(fd, 'publish_recording'),
  };
  if (id) {
    const { data: old } = await db.from('live_sessions').select('*').eq('id', id).eq('creator_id', creator.id).single();
    await db.from('live_sessions').update({ ...row, reminder_24h_sent: old.starts_at !== startsAt ? false : old.reminder_24h_sent, reminder_15m_sent: old.starts_at !== startsAt ? false : old.reminder_15m_sent }).eq('id', id);
    if (old.zoom_meeting_id) await updateMeeting(old.zoom_meeting_id, { topic: row.title, start_time: startsAt, duration: row.duration_min, timezone: 'Asia/Kolkata' }).catch(() => null);
    await log('live.update', 'live', id);
    done(slug, '/live', 'Session updated');
  }
  const m = await createMeeting({ topic: `${creator.name}: ${row.title}`, startISO: startsAt, durationMin: row.duration_min, record: row.publish_recording });
  const { data: l } = await db.from('live_sessions').insert({ ...row, zoom_meeting_id: m.id, zoom_password: m.password }).select('id').single();
  if (bool(fd, 'notify')) {
    await notifyMembers(creator.id, visibility === 'tiers' ? row.tier_ids : null, {
      kind: 'live_scheduled', title: `New live session: ${row.title}`, body: `${new Date(startsAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST`, link: `/${creator.slug}/live/${l.id}`, whatsapp: true,
    });
  }
  await log('live.create', 'live', l.id);
  done(slug, '/live', 'Live session scheduled with a Zoom meeting');
}

export async function cancelLive(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const { data: l } = await db.from('live_sessions').select('*').eq('id', str(fd, 'id')).eq('creator_id', creator.id).single();
  if (l.zoom_meeting_id) await deleteMeeting(l.zoom_meeting_id);
  await db.from('live_sessions').update({ status: 'cancelled' }).eq('id', l.id);
  await notifyMembers(creator.id, l.visibility === 'tiers' ? l.tier_ids : null, { kind: 'live_cancelled', title: `Cancelled: ${l.title}`, body: 'This live session has been cancelled. We\'ll share a new date soon.', link: `/${creator.slug}/live`, whatsapp: true });
  done(slug, '/live', 'Session cancelled and members notified');
}

/** Opens Zoom as the host (team must be signed in to the platform's Zoom account). */
export async function startAsHost(fd: FormData) {
  const { creator, db } = await studioCtx(fd, 'moderate');
  const { data: l } = await db.from('live_sessions').select('zoom_meeting_id').eq('id', str(fd, 'id')).eq('creator_id', creator.id).single();
  const url = await getStartUrl(l.zoom_meeting_id);
  redirect(url);
}

/* ───────── 1:1 bookings ───────── */
export async function saveBookingType(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  const id = strOrNull(fd, 'id');
  const row = {
    creator_id: creator.id, title: str(fd, 'title'), description: strOrNull(fd, 'description'), duration_min: int(fd, 'duration_min', 30),
    buffer_min: int(fd, 'buffer_min', 10), price_paise: toPaise(fd.get('price')) || 0, min_notice_hours: int(fd, 'min_notice_hours', 12),
    max_days_ahead: int(fd, 'max_days_ahead', 30), active: !bool(fd, 'inactive'),
  };
  if (id) await db.from('booking_types').update(row).eq('id', id).eq('creator_id', creator.id);
  else await db.from('booking_types').insert(row);
  done(slug, '/bookings', 'Saved');
}

export async function saveAvailability(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  // one textarea per weekday: "10:00-13:00, 16:00-19:00"
  const rows: any[] = [];
  for (let d = 0; d < 7; d++) {
    for (const range of str(fd, `day_${d}`).split(',').map((x) => x.trim()).filter(Boolean)) {
      const m = range.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (!m) throw new Error(`Couldn't read "${range}". Use 10:00-13:00`);
      rows.push({ creator_id: creator.id, weekday: d, start_time: `${m[1].padStart(2, '0')}:${m[2]}`, end_time: `${m[3].padStart(2, '0')}:${m[4]}` });
    }
  }
  await db.from('availability').delete().eq('creator_id', creator.id);
  if (rows.length) await db.from('availability').insert(rows);
  done(slug, '/bookings', 'Weekly availability saved');
}

export async function addBlock(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('availability_blocks').insert({ creator_id: creator.id, starts_at: istLocalToISO(fd.get('starts_at')), ends_at: istLocalToISO(fd.get('ends_at')) });
  done(slug, '/bookings', 'Time blocked');
}
export async function deleteBlock(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd);
  await db.from('availability_blocks').delete().eq('id', str(fd, 'id')).eq('creator_id', creator.id);
  done(slug, '/bookings');
}
export async function updateBookingStatus(fd: FormData) {
  const { creator, db, slug } = await studioCtx(fd, 'moderate');
  const status = str(fd, 'status');
  const { data: b } = await db.from('bookings').select('*').eq('id', str(fd, 'id')).eq('creator_id', creator.id).single();
  await db.from('bookings').update({ status }).eq('id', b.id);
  if (status === 'cancelled') {
    if (b.zoom_meeting_id) await deleteMeeting(b.zoom_meeting_id);
    await notify({ userId: b.user_id, creatorId: creator.id, kind: 'booking_cancelled', transactional: true, title: 'Your 1:1 session was cancelled', body: 'The team will contact you to reschedule or refund.', link: '/account/bookings' });
  }
  done(slug, '/bookings', 'Booking updated');
}
