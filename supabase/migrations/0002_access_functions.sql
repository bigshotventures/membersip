-- Access helper functions. All SECURITY DEFINER so RLS policies can call them without recursion.

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','team'));
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function team_role(c uuid) returns creator_team_role
language sql stable security definer set search_path = public as $$
  select role from creator_team where creator_id = c and user_id = auth.uid();
$$;

create or replace function can_view_studio(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() or team_role(c) is not null;
$$;

create or replace function can_manage(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() or (
    team_role(c) in ('owner','editor')
    and coalesce((select creator_edit_enabled from creators where id = c), false)
  );
$$;

create or replace function can_moderate(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() or team_role(c) in ('owner','editor','moderator');
$$;

create or replace function can_view_finance(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() or team_role(c) in ('owner','accountant');
$$;

-- Tier the current user can access for creator c (null if none).
create or replace function active_tier(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.tier_id from memberships m
  where m.creator_id = c and m.user_id = auth.uid()
    and (
      m.status in ('active','trialing')
      or (m.status = 'past_due' and now() < coalesce(m.current_period_end, now()) + make_interval(days => (select dunning_grace_days from platform_settings)))
      or (m.status = 'cancelled' and m.current_period_end > now())
    )
  limit 1;
$$;

create or replace function is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select active_tier(c) is not null or can_view_studio(c);
$$;

create or replace function has_tier_access(c uuid, tier_list uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select can_view_studio(c) or (
    active_tier(c) is not null and (cardinality(tier_list) = 0 or active_tier(c) = any(tier_list))
  );
$$;

create or replace function has_entitlement(k text, item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from entitlements where user_id = auth.uid() and kind = k and item_id = item);
$$;

create or replace function is_banned(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from member_restrictions r where r.creator_id = c and r.user_id = auth.uid()
                 and r.kind = 'banned' and (r.until is null or r.until > now()));
$$;

create or replace function can_post_in(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from member_restrictions r where r.creator_id = c and r.user_id = auth.uid()
                     and (r.until is null or r.until > now()));
$$;

create or replace function creator_visible(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from creators where id = c and status in ('waitlist','live')) or can_view_studio(c);
$$;

create or replace function can_read_post(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from posts x where x.id = p and (
      can_view_studio(x.creator_id) or (
        x.status = 'published' and not is_banned(x.creator_id) and (
          x.visibility = 'public'
          or (x.visibility = 'members' and active_tier(x.creator_id) is not null)
          or (x.visibility = 'tiers' and has_tier_access(x.creator_id, x.tier_ids))
          or (x.visibility = 'ppv' and (has_entitlement('post', x.id)
               or (cardinality(x.tier_ids) > 0 and has_tier_access(x.creator_id, x.tier_ids))))
        )
      )
    )
  );
$$;

create or replace function can_read_course(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from courses x where x.id = cid and (
      can_view_studio(x.creator_id) or (
        x.status = 'published' and not is_banned(x.creator_id) and (
          has_entitlement('course', x.id)
          or exists (select 1 from enrollments e join cohorts h on h.id = e.cohort_id
                     where e.course_id = x.id and e.user_id = auth.uid() and has_entitlement('cohort', h.id))
          or (cardinality(x.tier_ids) > 0 and has_tier_access(x.creator_id, x.tier_ids))
        )
      )
    )
  );
$$;

-- When a lesson unlocks for the current user (drip + cohorts)
create or replace function lesson_unlock_at(lid uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case
    when l.drip_days = 0 then '-infinity'::timestamptz
    else coalesce(h.starts_at, e.enrolled_at, now()) + make_interval(days => l.drip_days)
  end
  from lessons l
  left join enrollments e on e.course_id = l.course_id and e.user_id = auth.uid()
  left join cohorts h on h.id = e.cohort_id
  where l.id = lid;
$$;

create or replace function can_read_lesson(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lessons l join courses c on c.id = l.course_id
    where l.id = lid and (
      can_view_studio(c.creator_id)
      or (c.status = 'published' and l.is_preview)
      or (can_read_course(c.id) and lesson_unlock_at(l.id) <= now())
    )
  );
$$;

create or replace function can_access_space(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from spaces x where x.id = s and (
      can_view_studio(x.creator_id) or (
        not is_banned(x.creator_id) and (
          (x.cohort_id is not null and exists (select 1 from enrollments e where e.cohort_id = x.cohort_id and e.user_id = auth.uid()))
          or (x.cohort_id is null and has_tier_access(x.creator_id, x.tier_ids))
        )
      )
    )
  );
$$;

create or replace function can_access_live(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from live_sessions x where x.id = s and (
      can_view_studio(x.creator_id) or (
        not is_banned(x.creator_id) and (
          x.visibility = 'public'
          or (x.visibility = 'members' and active_tier(x.creator_id) is not null)
          or (x.visibility = 'tiers' and has_tier_access(x.creator_id, x.tier_ids))
          or (x.visibility = 'ppv' and (has_entitlement('event', x.id)
               or (cardinality(x.tier_ids) > 0 and has_tier_access(x.creator_id, x.tier_ids))))
        )
      )
    )
  );
$$;

create or replace function can_access_target(t_type text, t_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case t_type
    when 'post' then can_read_post(t_id)
    when 'space_post' then exists (select 1 from space_posts sp where sp.id = t_id and can_access_space(sp.space_id))
    when 'lesson' then can_read_lesson(t_id)
    when 'live' then can_access_live(t_id)
    else false end;
$$;

-- ───────── Business functions ─────────

create or replace function next_invoice_number() returns text
language plpgsql security definer set search_path = public as $$
declare v_fy text; n int; pfx text;
begin
  v_fy := case when extract(month from now() at time zone 'Asia/Kolkata') >= 4
    then to_char(now() at time zone 'Asia/Kolkata','YY') || to_char((now() at time zone 'Asia/Kolkata') + interval '1 year','YY')
    else to_char((now() at time zone 'Asia/Kolkata') - interval '1 year','YY') || to_char(now() at time zone 'Asia/Kolkata','YY') end;
  insert into invoice_counters as ic (fy, last_no) values (v_fy, 1)
    on conflict (fy) do update set last_no = ic.last_no + 1
    returning ic.last_no into n;
  select invoice_prefix into pfx from platform_settings;
  return pfx || '/' || v_fy || '/' || lpad(n::text, 6, '0');
end $$;

create or replace function award_points(c uuid, u uuid, pts int, why text, ref uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date; s member_stats; b record;
begin
  insert into points_ledger (creator_id, user_id, points, reason, ref_id) values (c, u, pts, why, ref);
  insert into member_stats (creator_id, user_id, points, current_streak, longest_streak, last_active_date)
  values (c, u, pts, 1, 1, today)
  on conflict (creator_id, user_id) do update set
    points = member_stats.points + pts,
    current_streak = case
      when member_stats.last_active_date = today then member_stats.current_streak
      when member_stats.last_active_date = today - 1 then member_stats.current_streak + 1
      else 1 end,
    longest_streak = greatest(member_stats.longest_streak, case
      when member_stats.last_active_date = today then member_stats.current_streak
      when member_stats.last_active_date = today - 1 then member_stats.current_streak + 1
      else 1 end),
    last_active_date = today
  returning * into s;

  for b in select * from badges where (creator_id = c or creator_id is null)
           and rule->>'type' in ('points','streak') loop
    if (b.rule->>'type' = 'points' and s.points >= (b.rule->>'gte')::int)
       or (b.rule->>'type' = 'streak' and s.current_streak >= (b.rule->>'gte')::int) then
      insert into user_badges (user_id, badge_id, creator_id) values (u, b.id, c) on conflict do nothing;
    end if;
  end loop;
end $$;

create or replace function award_tenure_badges() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into user_badges (user_id, badge_id, creator_id)
  select m.user_id, b.id, m.creator_id
  from memberships m join badges b on (b.creator_id = m.creator_id or b.creator_id is null)
  where b.rule->>'type' = 'tenure_months'
    and m.status in ('active','trialing','past_due')
    and m.started_at <= now() - make_interval(months => (b.rule->>'gte')::int)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function poll_results(p uuid) returns table(option_id uuid, label text, votes bigint)
language sql stable security definer set search_path = public as $$
  select o.id, o.label, count(v.user_id) from poll_options o
  left join poll_votes v on v.option_id = o.id
  where o.poll_id = p group by o.id, o.label, o.position order by o.position;
$$;

create or replace function vote_poll(p uuid, opts uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare pl polls;
begin
  select * into pl from polls where id = p;
  if pl is null then raise exception 'Poll not found'; end if;
  if pl.closes_at is not null and pl.closes_at < now() then raise exception 'Poll closed'; end if;
  if pl.post_id is not null and not can_read_post(pl.post_id) then raise exception 'No access'; end if;
  if pl.space_post_id is not null and not can_access_target('space_post', pl.space_post_id) then raise exception 'No access'; end if;
  if not pl.multiple and cardinality(opts) > 1 then raise exception 'Pick one option'; end if;
  delete from poll_votes where poll_id = p and user_id = auth.uid();
  insert into poll_votes (poll_id, option_id, user_id)
    select p, o, auth.uid() from unnest(opts) o where exists (select 1 from poll_options where id = o and poll_id = p);
end $$;

create or replace function complete_lesson(lid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l lessons; c courses; total int; done int; cert uuid; first_time boolean;
begin
  if not can_read_lesson(lid) then raise exception 'No access to this lesson'; end if;
  select * into l from lessons where id = lid;
  select * into c from courses where id = l.course_id;
  insert into enrollments (course_id, user_id) values (c.id, auth.uid()) on conflict do nothing;
  select completed_at is null into first_time from lesson_progress where user_id = auth.uid() and lesson_id = lid;
  insert into lesson_progress (user_id, lesson_id, course_id, completed_at)
    values (auth.uid(), lid, c.id, now())
    on conflict (user_id, lesson_id) do update set completed_at = coalesce(lesson_progress.completed_at, now()), updated_at = now();
  if coalesce(first_time, true) then
    perform award_points(c.creator_id, auth.uid(), 10, 'lesson_completed', lid);
  end if;
  select count(*) into total from lessons where course_id = c.id;
  select count(*) into done from lesson_progress where course_id = c.id and user_id = auth.uid() and completed_at is not null;
  if done >= total then
    update enrollments set completed_at = coalesce(completed_at, now()) where course_id = c.id and user_id = auth.uid();
    if c.certificate_enabled then
      insert into certificates (user_id, course_id) values (auth.uid(), c.id) on conflict do nothing;
      select id into cert from certificates where user_id = auth.uid() and course_id = c.id;
    end if;
  end if;
  return jsonb_build_object('done', done, 'total', total, 'course_completed', done >= total, 'certificate_id', cert);
end $$;

create or replace function submit_quiz(lid uuid, answers int[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare score int := 0; total int := 0; q record; i int := 1; passed boolean;
begin
  if not can_read_lesson(lid) then raise exception 'No access'; end if;
  for q in select * from quiz_questions where lesson_id = lid order by position loop
    total := total + 1;
    if answers[i] = q.correct_index then score := score + 1; end if;
    i := i + 1;
  end loop;
  insert into quiz_attempts (lesson_id, user_id, answers, score, total) values (lid, auth.uid(), answers, score, total);
  passed := total = 0 or score::numeric / total >= 0.7;
  if passed then perform complete_lesson(lid); end if;
  return jsonb_build_object('score', score, 'total', total, 'passed', passed);
end $$;

create or replace function leaderboard(c uuid, lim int default 50)
returns table(user_id uuid, full_name text, avatar_url text, points int, current_streak int, level_name text)
language sql stable security definer set search_path = public as $$
  select s.user_id, p.full_name, p.avatar_url, s.points, s.current_streak,
    (select name from levels lv where lv.creator_id = c and lv.min_points <= s.points order by lv.min_points desc limit 1)
  from member_stats s join profiles p on p.id = s.user_id
  where s.creator_id = c and p.deleted_at is null
  order by s.points desc limit lim;
$$;

create or replace function me() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(p) from profiles p where p.id = auth.uid();
$$;

create or replace function creator_dashboard(c uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not can_view_studio(c) then raise exception 'Not allowed'; end if;
  select jsonb_build_object(
    'active_members', (select count(*) from memberships where creator_id = c and status in ('active','trialing','past_due')),
    'trialing', (select count(*) from memberships where creator_id = c and status = 'trialing'),
    'past_due', (select count(*) from memberships where creator_id = c and status = 'past_due'),
    'paused', (select count(*) from memberships where creator_id = c and status = 'paused'),
    'new_30d', (select count(*) from memberships where creator_id = c and started_at > now() - interval '30 days'),
    'churned_30d', (select count(*) from memberships where creator_id = c and cancelled_at > now() - interval '30 days'),
    'mrr_paise', (select coalesce(sum(case m.billing_period
                     when 'monthly' then t.price_monthly
                     when 'quarterly' then t.price_quarterly / 3
                     when 'yearly' then t.price_yearly / 12 else 0 end),0)
                  from memberships m join tiers t on t.id = m.tier_id
                  where m.creator_id = c and m.status in ('active','past_due') and m.source = 'purchase'),
    'revenue_30d_paise', (select coalesce(sum(amount_paise - refunded_paise),0) from payments where creator_id = c and created_at > now() - interval '30 days'),
    'net_30d_paise', (select coalesce(sum(creator_net_paise),0) from payments where creator_id = c and created_at > now() - interval '30 days'),
    'waitlist', (select count(*) from waitlist where creator_id = c),
    'watch_hours_30d', (select coalesce(sum(seconds),0)/3600.0 from video_views where creator_id = c and day > current_date - 30),
    'revenue_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'paise', coalesce(s,0)) order by d),'[]'::jsonb) from (
         select g::date d, (select sum(amount_paise - refunded_paise) from payments p where p.creator_id = c and (p.created_at at time zone 'Asia/Kolkata')::date = g::date) s
         from generate_series(current_date - 29, current_date, interval '1 day') g) x),
    'members_by_tier', (select coalesce(jsonb_agg(jsonb_build_object('tier', t.name, 'count', (select count(*) from memberships m where m.tier_id = t.id and m.status in ('active','trialing','past_due')))),'[]'::jsonb) from tiers t where t.creator_id = c),
    'revenue_by_kind', (select coalesce(jsonb_object_agg(kind, s),'{}'::jsonb) from (select kind, sum(amount_paise) s from payments where creator_id = c and created_at > now() - interval '30 days' group by kind) k),
    'cancel_reasons', (select coalesce(jsonb_object_agg(reason, n),'{}'::jsonb) from (select reason, count(*) n from cancel_feedback where creator_id = c and created_at > now() - interval '90 days' group by reason) k),
    'top_posts', (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
         select p.id, p.title, (select count(*) from reactions r where r.target_type='post' and r.target_id=p.id) likes,
                (select count(*) from comments cm where cm.target_type='post' and cm.target_id=p.id) comments
         from posts p where p.creator_id = c and p.status = 'published' order by likes desc, comments desc limit 5) x)
  ) into r;
  return r;
end $$;

-- ───────── Triggers ─────────

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, phone, full_name, avatar_url)
  values (new.id, new.email, new.phone,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''),'@',1)),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create or replace function sync_user_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set email = new.email, phone = coalesce(new.phone, profiles.phone) where id = new.id;
  return new;
end $$;
create trigger on_auth_user_updated after update of email, phone on auth.users for each row execute function sync_user_contact();

create or replace function set_published_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
create trigger posts_published_at before insert or update on posts for each row execute function set_published_at();

create or replace function filter_keywords() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from blocked_keywords k where k.creator_id = new.creator_id and new.body ilike '%' || k.keyword || '%') then
    new.hidden := true;
    insert into reports (creator_id, reporter_id, target_type, target_id, reason)
      values (new.creator_id, new.author_id, tg_argv[0], new.id, 'Auto-flagged: blocked keyword');
  end if;
  return new;
end $$;
create trigger comments_filter before insert on comments for each row execute function filter_keywords('comment');
create trigger space_posts_filter before insert on space_posts for each row execute function filter_keywords('space_post');
create trigger chat_filter before insert on chat_messages for each row execute function filter_keywords('chat_message');

create or replace function points_on_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'comments' then perform award_points(new.creator_id, new.author_id, 2, 'comment', new.id);
  elsif tg_table_name = 'space_posts' then perform award_points(new.creator_id, new.author_id, 5, 'community_post', new.id);
  elsif tg_table_name = 'chat_messages' then perform award_points(new.creator_id, new.author_id, 1, 'chat', new.id);
  end if;
  return new;
end $$;
create trigger comments_points after insert on comments for each row when (not new.hidden) execute function points_on_activity();
create trigger space_posts_points after insert on space_posts for each row when (not new.hidden) execute function points_on_activity();
create trigger chat_points after insert on chat_messages for each row when (not new.hidden) execute function points_on_activity();

create or replace function checkin_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare ch challenges; n int;
begin
  select * into ch from challenges where id = new.challenge_id;
  perform award_points(ch.creator_id, new.user_id, ch.points_per_checkin, 'challenge_checkin', ch.id);
  select count(*) into n from challenge_checkins where challenge_id = ch.id and user_id = new.user_id;
  if n >= ch.days then
    update challenge_participants set completed_at = coalesce(completed_at, now()) where challenge_id = ch.id and user_id = new.user_id;
    if ch.completion_badge_id is not null then
      insert into user_badges (user_id, badge_id, creator_id) values (new.user_id, ch.completion_badge_id, ch.creator_id) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
create trigger challenge_checkin_points after insert on challenge_checkins for each row execute function checkin_points();

create or replace function notify_on_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_author uuid;
begin
  if new.parent_id is not null then
    select author_id into parent_author from comments where id = new.parent_id;
    if parent_author is not null and parent_author <> new.author_id then
      insert into notifications (user_id, creator_id, kind, title, body)
      values (parent_author, new.creator_id, 'reply', 'New reply to your comment', left(new.body, 140));
    end if;
  end if;
  return new;
end $$;
create trigger comments_notify after insert on comments for each row execute function notify_on_reply();
