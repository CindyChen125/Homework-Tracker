-- REVIEW / MANUAL APPLICATION ONLY. Adds Feedback Center tables and RLS.
-- This migration does not alter or delete existing Classboard content.
begin;

do $$ begin
  if to_regclass('public.profiles') is null or to_regprocedure('public.my_role()') is null then
    raise exception 'Feedback Center requires public.profiles and public.my_role() from accounts.sql';
  end if;
end $$;

create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null check (length(author_name) between 1 and 120),
  category text not null check (category in ('bug','feature','other')),
  title text not null check (length(btrim(title)) between 3 and 120),
  description text not null check (length(btrim(description)) between 10 and 4000),
  visibility text not null check (visibility in ('public','private')),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_replies (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.feedback_reports(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null check (length(author_name) between 1 and 120),
  author_role text not null check (author_role in ('reader','editor','admin')),
  body text not null check (length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists feedback_reports_status_created on public.feedback_reports(status, created_at desc, id);
create index if not exists feedback_reports_category_created on public.feedback_reports(category, created_at desc, id);
create index if not exists feedback_reports_author on public.feedback_reports(author_id, created_at desc, id);
create index if not exists feedback_replies_report_created on public.feedback_replies(report_id, created_at, id);

-- Identity and display attribution are always derived from the authenticated
-- profile. Clients receive no INSERT privilege for these protected columns.
create or replace function public.fill_feedback_report_author()
returns trigger language plpgsql security definer set search_path = '' as $$
declare profile public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to submit feedback.'; end if;
  select * into profile from public.profiles where id = auth.uid();
  if not found then raise exception 'Your account profile is unavailable.'; end if;
  new.author_id := profile.id;
  new.author_name := coalesce(nullif(left(btrim(profile.name),120),''), 'Classmate');
  new.status := 'open'; new.created_at := now(); new.updated_at := now();
  new.title := btrim(new.title); new.description := btrim(new.description);
  return new;
end $$;

create or replace function public.fill_feedback_reply_author()
returns trigger language plpgsql security definer set search_path = '' as $$
declare profile public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to reply.'; end if;
  select * into profile from public.profiles where id = auth.uid();
  if not found then raise exception 'Your account profile is unavailable.'; end if;
  new.author_id := profile.id;
  new.author_name := coalesce(nullif(left(btrim(profile.name),120),''), 'Classmate');
  new.author_role := case when profile.role in ('editor','admin') then profile.role else 'reader' end;
  new.body := btrim(new.body); new.created_at := now();
  return new;
end $$;

create or replace function public.touch_feedback_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists fill_feedback_report_author on public.feedback_reports;
create trigger fill_feedback_report_author before insert on public.feedback_reports
for each row execute function public.fill_feedback_report_author();
drop trigger if exists touch_feedback_report on public.feedback_reports;
create trigger touch_feedback_report before update on public.feedback_reports
for each row execute function public.touch_feedback_report();
drop trigger if exists fill_feedback_reply_author on public.feedback_replies;
create trigger fill_feedback_reply_author before insert on public.feedback_replies
for each row execute function public.fill_feedback_reply_author();

alter table public.feedback_reports enable row level security;
alter table public.feedback_replies enable row level security;
revoke all on public.feedback_reports, public.feedback_replies from public, anon, authenticated;
grant select on public.feedback_reports, public.feedback_replies to authenticated;
grant insert (category,title,description,visibility) on public.feedback_reports to authenticated;
grant update (status) on public.feedback_reports to authenticated;
grant delete on public.feedback_reports to authenticated;
grant insert (report_id,body) on public.feedback_replies to authenticated;

-- Restrictive session guards remain effective even if a broad policy is added later.
drop policy if exists "feedback reports require session" on public.feedback_reports;
create policy "feedback reports require session" on public.feedback_reports as restrictive for all to anon, authenticated
using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
drop policy if exists "feedback replies require session" on public.feedback_replies;
create policy "feedback replies require session" on public.feedback_replies as restrictive for all to anon, authenticated
using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

drop policy if exists "feedback reports visible" on public.feedback_reports;
create policy "feedback reports visible" on public.feedback_reports for select to authenticated using (
  visibility = 'public' or author_id = auth.uid() or public.my_role() = 'admin'
);
drop policy if exists "feedback reports create own" on public.feedback_reports;
create policy "feedback reports create own" on public.feedback_reports for insert to authenticated with check (
  author_id = auth.uid() and status = 'open'
);
drop policy if exists "feedback reports admin status" on public.feedback_reports;
create policy "feedback reports admin status" on public.feedback_reports for update to authenticated
using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
drop policy if exists "feedback reports admin delete" on public.feedback_reports;
create policy "feedback reports admin delete" on public.feedback_reports for delete to authenticated
using (public.my_role() = 'admin');

drop policy if exists "feedback replies visible with report" on public.feedback_replies;
create policy "feedback replies visible with report" on public.feedback_replies for select to authenticated using (
  exists (select 1 from public.feedback_reports report where report.id = report_id and
    (report.visibility = 'public' or report.author_id = auth.uid() or public.my_role() = 'admin'))
);
drop policy if exists "feedback replies create with report" on public.feedback_replies;
create policy "feedback replies create with report" on public.feedback_replies for insert to authenticated with check (
  author_id = auth.uid() and exists (
    select 1 from public.feedback_reports report where report.id = report_id and
      (report.visibility = 'public' or report.author_id = auth.uid() or public.my_role() = 'admin')
  )
);

revoke all on function public.fill_feedback_report_author(), public.fill_feedback_reply_author(),
  public.touch_feedback_report() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
