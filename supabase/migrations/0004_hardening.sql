-- Trigger functions are never called directly.
revoke execute on function checkin_points(), filter_keywords(), handle_new_user(), notify_on_reply(),
  points_on_activity(), sync_user_contact(), set_published_at() from public, anon, authenticated;
-- Signed-in only actions
revoke execute on function complete_lesson(uuid), submit_quiz(uuid, int[]), vote_poll(uuid, uuid[]),
  creator_dashboard(uuid), me() from public, anon;
grant execute on function complete_lesson(uuid), submit_quiz(uuid, int[]), vote_poll(uuid, uuid[]),
  creator_dashboard(uuid), me() to authenticated;
alter function set_published_at() set search_path = public;
-- Access helpers (can_*, has_*, is_*) stay executable: RLS policies run them as the calling role.
