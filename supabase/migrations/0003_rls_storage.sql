-- Row level security. Server-only writes (payments, memberships, webhooks) use the service role and bypass RLS.

do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Studio-managed, creator-scoped tables: studio team reads, managers write.
do $$ declare t text; begin
  foreach t in array array['tiers','coupons','videos','posts','courses','products','live_sessions','booking_types',
    'availability','availability_blocks','spaces','badges','levels','challenges','email_campaigns','sequences',
    'automations','webhook_endpoints','ab_tests','imports','preview_clips','polls','blocked_keywords'] loop
    execute format('create policy studio_read on public.%I for select using (can_view_studio(creator_id))', t);
    execute format('create policy studio_write on public.%I for all using (can_manage(creator_id)) with check (can_manage(creator_id))', t);
  end loop;
end $$;

-- Finance / log tables: read-only for studio (finance roles), writes by server.
create policy finance_read on payments for select using (can_view_finance(creator_id) or user_id = auth.uid());
create policy finance_read on payouts for select using (can_view_finance(creator_id));
create policy finance_read on refunds for select using (exists (select 1 from payments p where p.id = payment_id and can_view_finance(p.creator_id)));
create policy finance_read on payment_splits for select using (can_view_finance(creator_id));
create policy finance_read on revenue_splits for select using (can_view_finance(creator_id));
create policy staff_write on revenue_splits for all using (is_staff()) with check (is_staff());
create policy read_own on invoices for select using (user_id = auth.uid() or can_view_finance(creator_id));
create policy read_own on orders for select using (user_id = auth.uid() or can_view_studio(creator_id));
create policy studio_read on message_log for select using (can_view_studio(creator_id));
create policy studio_read on automation_runs for select using (exists (select 1 from automations a where a.id = automation_id and can_view_studio(a.creator_id)));
create policy studio_read on webhook_deliveries for select using (exists (select 1 from webhook_endpoints w where w.id = endpoint_id and can_view_studio(w.creator_id)));
create policy studio_read on ab_events for select using (exists (select 1 from ab_tests a where a.id = test_id and can_view_studio(a.creator_id)));
create policy studio_read on api_keys for select using (can_view_studio(creator_id));
create policy studio_read on cancel_feedback for select using (can_view_studio(creator_id));
create policy studio_read on audit_log for select using (is_staff() or (creator_id is not null and can_view_studio(creator_id)));

-- Platform
create policy public_read on platform_settings for select using (true);
create policy staff_write on platform_settings for update using (is_admin());
create policy public_read on service_packages for select using (true);
create policy staff_write on service_packages for all using (is_staff()) with check (is_staff());
create policy studio_read on service_orders for select using (can_view_studio(creator_id));
create policy owner_request on service_orders for insert with check (can_view_studio(creator_id) and status = 'requested');
create policy staff_write on service_orders for update using (is_staff());

-- Profiles: public card columns readable by everyone; sensitive columns only via me() or server.
create policy public_read on profiles for select using (true);
create policy update_own on profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke select, update on profiles from anon, authenticated;
grant select (id, full_name, avatar_url, bio, created_at) on profiles to anon, authenticated;
grant update (full_name, avatar_url, bio, phone, state_code, email_opt_in, whatsapp_opt_in) on profiles to authenticated;

-- Creators: public storefront columns only.
create policy public_read on creators for select using (status in ('waitlist','live') or can_view_studio(id));
create policy studio_write on creators for update using (can_manage(id)) with check (can_manage(id));
create policy staff_insert on creators for insert with check (is_staff());
revoke select, insert, update on creators from anon, authenticated;
grant select (id, slug, name, tagline, bio, category, avatar_url, banner_url, intro_video_id, testimonials, socials, theme,
              status, launch_at, verified, created_at) on creators to anon, authenticated;
grant update (name, tagline, bio, category, avatar_url, banner_url, intro_video_id, testimonials, socials, theme) on creators to authenticated;

create policy read_team on creator_team for select using (user_id = auth.uid() or can_view_studio(creator_id));
create policy staff_write on creator_team for all using (is_staff()) with check (is_staff());

-- Public catalogue reads
create policy public_read on tiers for select using (is_active and creator_visible(creator_id));
revoke select on tiers from anon, authenticated;
grant select (id, creator_id, name, description, perks, price_monthly, price_quarterly, price_yearly, price_lifetime,
              trial_days, position, is_active, is_featured, merch_discount_pct) on tiers to anon, authenticated;
grant insert, update, delete on tiers to authenticated;

create policy public_read on posts for select using (status = 'published' and creator_visible(creator_id));
create policy read_if_allowed on post_bodies for select using (can_read_post(post_id));
create policy studio_write on post_bodies for all using (exists (select 1 from posts p where p.id = post_id and can_manage(p.creator_id)))
  with check (exists (select 1 from posts p where p.id = post_id and can_manage(p.creator_id)));

create policy public_read on videos for select using (is_public);
create policy public_read on polls for select using ((post_id is null or can_read_post(post_id)) and (space_post_id is null or can_access_target('space_post', space_post_id)));
create policy public_read on poll_options for select using (exists (select 1 from polls p where p.id = poll_id));
create policy studio_write on poll_options for all using (exists (select 1 from polls p where p.id = poll_id and can_manage(p.creator_id)))
  with check (exists (select 1 from polls p where p.id = poll_id and can_manage(p.creator_id)));
create policy own_votes on poll_votes for select using (user_id = auth.uid());

create policy public_read on preview_clips for select using (creator_visible(creator_id));

create policy public_read on courses for select using (status = 'published' and creator_visible(creator_id));
create policy public_read on course_modules for select using (exists (select 1 from courses c where c.id = course_id and (c.status = 'published' or can_view_studio(c.creator_id))));
create policy studio_write on course_modules for all using (exists (select 1 from courses c where c.id = course_id and can_manage(c.creator_id)))
  with check (exists (select 1 from courses c where c.id = course_id and can_manage(c.creator_id)));
create policy public_read on lessons for select using (exists (select 1 from courses c where c.id = course_id and (c.status = 'published' or can_view_studio(c.creator_id))));
create policy studio_write on lessons for all using (exists (select 1 from courses c where c.id = course_id and can_manage(c.creator_id)))
  with check (exists (select 1 from courses c where c.id = course_id and can_manage(c.creator_id)));
create policy read_if_allowed on lesson_contents for select using (can_read_lesson(lesson_id));
create policy studio_write on lesson_contents for all using (exists (select 1 from lessons l join courses c on c.id = l.course_id where l.id = lesson_id and can_manage(c.creator_id)))
  with check (exists (select 1 from lessons l join courses c on c.id = l.course_id where l.id = lesson_id and can_manage(c.creator_id)));
create policy read_if_allowed on quiz_questions for select using (can_read_lesson(lesson_id));
create policy studio_write on quiz_questions for all using (exists (select 1 from lessons l join courses c on c.id = l.course_id where l.id = lesson_id and can_manage(c.creator_id)))
  with check (exists (select 1 from lessons l join courses c on c.id = l.course_id where l.id = lesson_id and can_manage(c.creator_id)));
revoke select on quiz_questions from anon, authenticated;
grant select (id, lesson_id, question, options, position) on quiz_questions to anon, authenticated;
grant insert, update, delete on quiz_questions to authenticated;
create policy own_attempts on quiz_attempts for select using (user_id = auth.uid());
create policy public_read on cohorts for select using (exists (select 1 from courses c where c.id = course_id and (c.status = 'published' or can_view_studio(c.creator_id))));
create policy studio_write on cohorts for all using (exists (select 1 from courses c where c.id = course_id and can_manage(c.creator_id)))
  with check (exists (select 1 from courses c where c.id = course_id and can_manage(c.creator_id)));
create policy own_or_studio on enrollments for select using (user_id = auth.uid() or exists (select 1 from courses c where c.id = course_id and can_view_studio(c.creator_id)));
create policy own_progress on lesson_progress for select using (user_id = auth.uid() or exists (select 1 from courses c where c.id = course_id and can_view_studio(c.creator_id)));
create policy own_progress_write on lesson_progress for insert with check (user_id = auth.uid() and can_read_lesson(lesson_id));
create policy own_progress_update on lesson_progress for update using (user_id = auth.uid());
create policy read_if_allowed on assignments for select using (can_read_lesson(lesson_id));
create policy studio_write on assignments for all using (exists (select 1 from lessons l join courses c on c.id = l.course_id where l.id = lesson_id and can_manage(c.creator_id)))
  with check (exists (select 1 from lessons l join courses c on c.id = l.course_id where l.id = lesson_id and can_manage(c.creator_id)));
create policy own_or_grader on submissions for select using (user_id = auth.uid() or exists (
  select 1 from assignments a join lessons l on l.id = a.lesson_id join courses c on c.id = l.course_id where a.id = assignment_id and can_moderate(c.creator_id)));
create policy submit_own on submissions for insert with check (user_id = auth.uid() and exists (select 1 from assignments a where a.id = assignment_id and can_read_lesson(a.lesson_id)));
create policy edit_own on submissions for update using (user_id = auth.uid() and score is null);
create policy grade on submissions for update using (exists (
  select 1 from assignments a join lessons l on l.id = a.lesson_id join courses c on c.id = l.course_id where a.id = assignment_id and can_moderate(c.creator_id)));
create policy own_or_studio on certificates for select using (user_id = auth.uid() or exists (select 1 from courses c where c.id = course_id and can_view_studio(c.creator_id)));

create policy public_read on products for select using (active and creator_visible(creator_id));
revoke select on products from anon, authenticated;
grant select (id, creator_id, kind, title, description, cover_url, price_paise, stock, eligible_tier_ids, active, position, created_at) on products to anon, authenticated;
grant insert, update, delete on products to authenticated;

create policy public_read on live_sessions for select using (status <> 'cancelled' and creator_visible(creator_id));
revoke select on live_sessions from anon, authenticated;
grant select (id, creator_id, title, description, starts_at, duration_min, visibility, tier_ids, ticket_price_paise,
              recording_video_id, publish_recording, status, created_at) on live_sessions to anon, authenticated;
grant insert, update, delete on live_sessions to authenticated;

create policy public_read on booking_types for select using (active and creator_visible(creator_id));
create policy public_read on availability for select using (creator_visible(creator_id));
create policy own_or_studio on bookings for select using (user_id = auth.uid() or can_view_studio(creator_id));
create policy studio_update on bookings for update using (can_moderate(creator_id));
revoke select on bookings from anon, authenticated;
grant select (id, booking_type_id, creator_id, user_id, starts_at, ends_at, status, notes, order_id, created_at) on bookings to authenticated;
grant update (status, notes) on bookings to authenticated;

-- Community
create policy public_read on spaces for select using (creator_visible(creator_id));
create policy read_if_allowed on space_posts for select using (can_access_space(space_id) and (not hidden or author_id = auth.uid() or can_moderate(creator_id)));
create policy create_own on space_posts for insert with check (
  author_id = auth.uid() and can_access_space(space_id) and can_post_in(creator_id)
  and ((exists (select 1 from spaces s where s.id = space_id and s.members_can_post) and not is_announcement and not pinned) or can_moderate(creator_id)));
create policy edit_own on space_posts for update using (author_id = auth.uid() or can_moderate(creator_id));
create policy delete_own on space_posts for delete using (author_id = auth.uid() or can_moderate(creator_id));

create policy read_if_allowed on comments for select using (can_access_target(target_type, target_id) and (not hidden or author_id = auth.uid() or can_moderate(creator_id)));
create policy create_own on comments for insert with check (author_id = auth.uid() and can_post_in(creator_id) and can_access_target(target_type, target_id));
create policy edit_own on comments for update using (author_id = auth.uid() or can_moderate(creator_id));
create policy delete_own on comments for delete using (author_id = auth.uid() or can_moderate(creator_id));

create policy read_all on reactions for select using (true);
create policy react_own on reactions for insert with check (user_id = auth.uid() and can_access_target(target_type, target_id));
create policy unreact_own on reactions for delete using (user_id = auth.uid());

create policy read_if_allowed on chat_messages for select using (can_access_space(space_id) and (not hidden or can_moderate(creator_id)));
create policy create_own on chat_messages for insert with check (author_id = auth.uid() and can_access_space(space_id) and can_post_in(creator_id));
create policy moderate on chat_messages for update using (can_moderate(creator_id));
create policy delete_own on chat_messages for delete using (author_id = auth.uid() or can_moderate(creator_id));

create policy thread_read on direct_messages for select using (member_id = auth.uid() or can_moderate(creator_id));
create policy thread_send on direct_messages for insert with check (
  sender_id = auth.uid() and ((member_id = auth.uid() and active_tier(creator_id) is not null and can_post_in(creator_id)) or can_moderate(creator_id)));
create policy thread_mark_read on direct_messages for update using (member_id = auth.uid() or can_moderate(creator_id));

create policy report_own on reports for insert with check (reporter_id = auth.uid());
create policy moderators on reports for select using (can_moderate(creator_id) or reporter_id = auth.uid());
create policy moderators_update on reports for update using (can_moderate(creator_id));

create policy moderators on member_restrictions for all using (can_moderate(creator_id)) with check (can_moderate(creator_id));
create policy see_own on member_restrictions for select using (user_id = auth.uid());

create policy own on notifications for select using (user_id = auth.uid());
create policy own_update on notifications for update using (user_id = auth.uid());
create policy own_delete on notifications for delete using (user_id = auth.uid());

create policy public_read on reviews for select using (not hidden or user_id = auth.uid() or can_moderate(creator_id));
create policy write_own on reviews for insert with check (user_id = auth.uid() and (
  (target_type = 'creator' and active_tier(creator_id) is not null)
  or (target_type = 'course' and can_read_course(target_id))
  or (target_type = 'product' and has_entitlement('product', target_id))));
create policy edit_own on reviews for update using (user_id = auth.uid() or can_moderate(creator_id));
create policy delete_own on reviews for delete using (user_id = auth.uid() or can_moderate(creator_id));

-- Gamification
create policy public_read on member_stats for select using (creator_visible(creator_id));
create policy own_or_studio on points_ledger for select using (user_id = auth.uid() or can_view_studio(creator_id));
create policy public_read on levels for select using (creator_visible(creator_id));
create policy public_read on badges for select using (creator_id is null or creator_visible(creator_id));
create policy public_read on user_badges for select using (true);
create policy award_manual on user_badges for insert with check (can_manage(creator_id));
create policy revoke_manual on user_badges for delete using (can_manage(creator_id));
create policy public_read on challenges for select using (creator_visible(creator_id));
create policy read_participants on challenge_participants for select using (true);
create policy join_challenge on challenge_participants for insert with check (
  user_id = auth.uid() and exists (select 1 from challenges c where c.id = challenge_id and has_tier_access(c.creator_id, c.tier_ids)));
create policy leave_challenge on challenge_participants for delete using (user_id = auth.uid());
create policy read_checkins on challenge_checkins for select using (true);
create policy checkin_own on challenge_checkins for insert with check (
  user_id = auth.uid()
  and exists (select 1 from challenge_participants p where p.challenge_id = challenge_checkins.challenge_id and p.user_id = auth.uid())
  and exists (select 1 from challenges c where c.id = challenge_id
              and day between 1 and c.days
              and day <= floor(extract(epoch from now() - c.starts_at) / 86400)::int + 1));

-- Memberships & purchases: read own; studio reads; writes only via server.
create policy own_or_studio on memberships for select using (user_id = auth.uid() or can_view_studio(creator_id));
create policy own_or_studio on entitlements for select using (user_id = auth.uid() or can_view_studio(creator_id));
create policy own_or_studio on gift_cards for select using (purchaser_id = auth.uid() or redeemed_by = auth.uid() or can_view_studio(creator_id));
create policy own_or_studio on referrals for select using (referrer_id = auth.uid() or can_view_studio(creator_id));
create policy studio_read on waitlist for select using (can_view_studio(creator_id));
create policy studio_delete on waitlist for delete using (can_manage(creator_id));

-- Sequences children
create policy studio_read on sequence_steps for select using (exists (select 1 from sequences s where s.id = sequence_id and can_view_studio(s.creator_id)));
create policy studio_write on sequence_steps for all using (exists (select 1 from sequences s where s.id = sequence_id and can_manage(s.creator_id)))
  with check (exists (select 1 from sequences s where s.id = sequence_id and can_manage(s.creator_id)));
create policy studio_read on sequence_runs for select using (exists (select 1 from sequences s where s.id = sequence_id and can_view_studio(s.creator_id)));

-- Compliance
create policy own on consents for select using (user_id = auth.uid() or is_staff());
create policy own_insert on consents for insert with check (user_id = auth.uid());
create policy own on data_requests for select using (user_id = auth.uid() or is_staff());
create policy own_insert on data_requests for insert with check (user_id = auth.uid() and status = 'open');
create policy staff_update on data_requests for update using (is_staff());

create policy own_views on video_views for select using (user_id = auth.uid() or can_view_studio(creator_id));

-- Function execution: keep internals away from anon callers
revoke execute on function award_points(uuid, uuid, int, text, uuid) from public, anon, authenticated;
revoke execute on function award_tenure_badges() from public, anon, authenticated;
revoke execute on function next_invoice_number() from public, anon, authenticated;

-- ───────── Storage ─────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('public', 'public', true, 20971520),
       ('private', 'private', false, 524288000)
on conflict (id) do nothing;

create policy "public bucket read" on storage.objects for select using (bucket_id = 'public');
-- All uploads go through signed upload URLs issued by the server after a permission check.

-- ───────── Realtime ─────────
alter publication supabase_realtime add table chat_messages, direct_messages, notifications, comments;
