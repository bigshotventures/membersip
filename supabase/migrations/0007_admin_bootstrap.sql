-- Anyone who signs up with an email in this list becomes a platform admin automatically.
alter table platform_settings add column admin_emails text[] not null default '{}';
update platform_settings set admin_emails = array['bigshotventures@gmail.com'];

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, phone, full_name, avatar_url, role)
  values (new.id, new.email, new.phone,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''),'@',1)),
          new.raw_user_meta_data->>'avatar_url',
          case when lower(coalesce(new.email,'')) = any (select lower(unnest(admin_emails)) from platform_settings) then 'admin'::platform_role else 'member'::platform_role end)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function handle_new_user() from public, anon, authenticated;
