-- Allow likes on comments: access follows the comment's parent content.
create or replace function can_access_target(t_type text, t_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare c comments;
begin
  if t_type = 'comment' then
    select * into c from comments where id = t_id;
    if c is null then return false; end if;
    return can_access_target(c.target_type, c.target_id);
  end if;
  return case t_type
    when 'post' then can_read_post(t_id)
    when 'space_post' then exists (select 1 from space_posts sp where sp.id = t_id and can_access_space(sp.space_id))
    when 'lesson' then can_read_lesson(t_id)
    when 'live' then can_access_live(t_id)
    else false end;
end $$;
