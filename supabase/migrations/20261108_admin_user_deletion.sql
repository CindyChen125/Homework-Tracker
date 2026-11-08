-- REVIEW / MANUAL APPLICATION ONLY. Supports the delete-user Edge Function.
-- This migration deletes no accounts or class data by itself.
begin;

create table if not exists public.user_deletion_requests (
  target_id uuid primary key references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now()
);
alter table public.user_deletion_requests enable row level security;
revoke all on public.user_deletion_requests from public, anon, authenticated;

-- Reserve a deletion while holding the same database lock used by the final
-- profile guard. Concurrent requests therefore cannot reserve every admin.
create or replace function public.prepare_user_deletion(p_target uuid)
returns table(target_id uuid, target_name text, target_email text, target_role text)
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  target public.profiles%rowtype;
  available_admins integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('classboard-admin-deletion', 0));
  delete from public.user_deletion_requests where requested_at < now() - interval '10 minutes';

  if caller is null or not exists (
    select 1 from public.profiles where id = caller and role = 'admin'
  ) then
    raise exception 'Admin access is required.';
  end if;
  if p_target is null then raise exception 'Choose an account to delete.'; end if;
  if p_target = caller then raise exception 'You cannot delete your own account.'; end if;

  select * into target from public.profiles where id = p_target for update;
  if not found then raise exception 'That account no longer exists.'; end if;
  if exists (select 1 from public.user_deletion_requests r where r.target_id = p_target) then
    raise exception 'That account is already being deleted.';
  end if;

  if target.role = 'admin' then
    select count(*) into available_admins
    from public.profiles p
    where p.role = 'admin'
      and not exists (select 1 from public.user_deletion_requests r where r.target_id = p.id);
    if available_admins <= 1 then
      raise exception 'The last remaining administrator cannot be deleted.';
    end if;
  end if;

  insert into public.user_deletion_requests(target_id, requested_by) values (p_target, caller);
  return query select target.id, target.name, target.email, target.role;
end $$;

create or replace function public.cancel_user_deletion(p_target uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.user_deletion_requests
  where target_id = p_target and requested_by = auth.uid()
$$;

-- Final protection runs in the Auth user's cascade transaction. The advisory
-- lock serializes concurrent admin deletes and demotions, so one admin remains.
create or replace function public.protect_last_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare removing_admin boolean := false;
begin
  if old.role = 'admin' then
    if tg_op = 'DELETE' then
      removing_admin := true;
    elsif tg_op = 'UPDATE' and new.role <> 'admin' then
      removing_admin := true;
    end if;
  end if;
  if removing_admin then
    perform pg_advisory_xact_lock(hashtextextended('classboard-admin-deletion', 0));
    if not exists (select 1 from public.profiles p where p.id <> old.id and p.role = 'admin') then
      raise exception 'The last remaining administrator cannot be deleted or demoted.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists protect_last_admin on public.profiles;
create trigger protect_last_admin before update of role or delete on public.profiles
for each row execute function public.protect_last_admin();

revoke all on function public.prepare_user_deletion(uuid), public.cancel_user_deletion(uuid),
  public.protect_last_admin() from public, anon;
grant execute on function public.prepare_user_deletion(uuid), public.cancel_user_deletion(uuid) to authenticated;
revoke all on function public.protect_last_admin() from authenticated;

notify pgrst, 'reload schema';
commit;
