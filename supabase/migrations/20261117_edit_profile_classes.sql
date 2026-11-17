-- Apply after 20261117_profile_classes.sql. Allows a signed-in user to correct
-- their own class choices; no role, email, or other profile field is writable.
begin;
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
  where id = auth.uid();
  if not found then raise exception 'Your profile could not be found'; end if;
end $$;
revoke all on function public.set_my_classes(text,text,text) from public, anon;
grant execute on function public.set_my_classes(text,text,text) to authenticated;
commit;
