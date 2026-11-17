-- Apply after 20261117_profile_classes.sql and before publishing the frontend.
-- Existing homework and roles are unchanged. Unmapped subjects are classwide.
begin;

create or replace function public.can_see_homework(p_subject text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    public.my_role() = 'admin'
    or not (p_subject = any(array[
      'EC(H)','EC(S+1)','EC(S+2)','EC(S)',
      'EE(H)','EE(S+1)','EE(S+2)','EE(S)',
      'Math(S+1)','Math(S+2)','Math(S+3)','Math(S)'
    ]))
    or exists (
      select 1 from public.profiles p where p.id = auth.uid()
        and p_subject in (p.ec_class,p.ee_class,p.math_class)
    )
  )
$$;
revoke all on function public.can_see_homework(text) from public, anon;
grant execute on function public.can_see_homework(text) to authenticated;

-- Restrictive policies are ANDed with existing permissive grants and the
-- editor/admin write guards. A broad legacy SELECT policy cannot bypass them.
drop policy if exists "homework class read guard" on public.items;
create policy "homework class read guard" on public.items as restrictive
  for select to authenticated using (public.can_see_homework(subject));
drop policy if exists "homework class insert guard" on public.items;
create policy "homework class insert guard" on public.items as restrictive
  for insert to authenticated with check (public.can_see_homework(subject));
drop policy if exists "homework class update guard" on public.items;
create policy "homework class update guard" on public.items as restrictive
  for update to authenticated using (public.can_see_homework(subject))
  with check (public.can_see_homework(subject));
drop policy if exists "homework class delete guard" on public.items;
create policy "homework class delete guard" on public.items as restrictive
  for delete to authenticated using (public.can_see_homework(subject));

commit;
