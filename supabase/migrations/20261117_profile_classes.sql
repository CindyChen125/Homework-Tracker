-- Apply before publishing the matching frontend. Existing accounts retain their roles.
-- Safe to rerun after an interrupted SQL Editor attempt.
begin;

alter table public.profiles add column if not exists ec_class text;
alter table public.profiles add column if not exists ee_class text;
alter table public.profiles add column if not exists math_class text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_ec_class_check') then
    alter table public.profiles add constraint profiles_ec_class_check
      check (ec_class is null or ec_class in ('EC(H)', 'EC(S+1)', 'EC(S+2)', 'EC(S)'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_ee_class_check') then
    alter table public.profiles add constraint profiles_ee_class_check
      check (ee_class is null or ee_class in ('EE(H)', 'EE(S+1)', 'EE(S+2)', 'EE(S)'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_math_class_check') then
    alter table public.profiles add constraint profiles_math_class_check
      check (math_class is null or math_class in ('Math(S+1)', 'Math(S+2)', 'Math(S+3)', 'Math(S)'));
  end if;
end $$;

-- Only the new account trigger may read signup metadata. It never copies permissions.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email, name, role, news_manager, ec_class, ee_class, math_class)
  values (
    new.id, new.email, nullif(new.raw_user_meta_data ->> 'name', ''), 'reader', false,
    case when new.raw_user_meta_data ->> 'ec_class' in ('EC(H)', 'EC(S+1)', 'EC(S+2)', 'EC(S)') then new.raw_user_meta_data ->> 'ec_class' end,
    case when new.raw_user_meta_data ->> 'ee_class' in ('EE(H)', 'EE(S+1)', 'EE(S+2)', 'EE(S)') then new.raw_user_meta_data ->> 'ee_class' end,
    case when new.raw_user_meta_data ->> 'math_class' in ('Math(S+1)', 'Math(S+2)', 'Math(S+3)', 'Math(S)') then new.raw_user_meta_data ->> 'math_class' end
  ) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Existing users complete their own choices without receiving profile UPDATE rights.
create or replace function public.set_my_classes(p_ec text, p_ee text, p_math text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_ec is null or p_ec not in ('EC(H)', 'EC(S+1)', 'EC(S+2)', 'EC(S)')
    or p_ee is null or p_ee not in ('EE(H)', 'EE(S+1)', 'EE(S+2)', 'EE(S)')
    or p_math is null or p_math not in ('Math(S+1)', 'Math(S+2)', 'Math(S+3)', 'Math(S)') then
    raise exception 'Choose a valid EC, EE, and Math class';
  end if;
  update public.profiles set ec_class = p_ec, ee_class = p_ee, math_class = p_math
  where id = auth.uid() and ec_class is null and ee_class is null and math_class is null;
  if not found then raise exception 'Your classes are already set or your profile could not be found'; end if;
end $$;
revoke all on function public.set_my_classes(text,text,text) from public, anon;
grant execute on function public.set_my_classes(text,text,text) to authenticated;

commit;
