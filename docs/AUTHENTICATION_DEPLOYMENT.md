# Authentication-only Classboard — manual deployment

Updated 2026-10-15. This guide supersedes the anonymous/public-link descriptions in earlier phase reports. No migration or live Supabase setting was applied by this implementation.

## What ships in the frontend

- Signed-out visitors see only Sign In / Sign Up, at every hash route. No class component or class-data request starts before the session check completes.
- Supabase persists sessions, refreshes tokens, handles confirmation URLs, and notifies the app of sign-in/sign-out across tabs. The app checks the profile outside the auth callback, avoiding the SDK auth-lock deadlock. New authenticated identities open Today.
- Sign-out is accessible at the bottom of the unified sidebar for Reader, Editor and Admin, on phone and desktop (open the top-left menu on phones). It signs out this browser session, not every device. The app unmounts class content and clears in-memory page data on auth changes. Stale checks cannot restore access after sign-out; a failed sign-out keeps content hidden and offers retry.
- Readers cannot open Post or People, including direct URLs. Editors cannot open People. News-manager permission remains independent. Missing/error profiles return Reader with no fallback news-management permission.
- Registration remains email/password based. The client sends only a display name in signup metadata. The new trigger explicitly creates Reader profiles with `news_manager=false`, ignoring forged signup permissions. Existing account roles are not rewritten.
- Teacher files now use 60-second signed links, not public URLs. Choose **Get file**, then **Open**; the button resets before link expiry. Notes retain 60-second signed downloads; news images retain their existing 10-minute signed URLs.
- Missing Supabase configuration shows a setup notice, not an automatically authenticated demo Admin. Existing local demo records are left untouched.

The sign-in page preserves the existing typography, theme tokens, spacing and form controls. Inputs have labels/autocomplete, status/error messages are announced, mode switches are native buttons, and the sign-out action has a 44px minimum height. No screenshots or screen-viewing tools were used for this change; visual/device/keyboard/screen-reader checks remain manual.

## Policy review of the repository

This is a review of the checked-in SQL, **not an inspection of your live project's configuration**. Audit any custom policies or additional buckets in the dashboard before applying.

| Existing surface | Previous access | New migration |
| --- | --- | --- |
| `items`, `timetable`, `schedule_changes`, `materials` | Anonymous `public read`; Editor/Admin writes after `accounts.sql` | Authenticated reads; anonymous/PUBLIC grants revoked; restrictive session guard; existing Editor/Admin writes retained and reinforced |
| `profiles` | Own profile or admin; admin updates | Same role restrictions, plus session guard and no anonymous/PUBLIC table grant; existing profiles/roles unchanged |
| `class_news` | Published anonymous reads, manager writes | Published reads only when signed in; scheduled posts remain manager/admin-only |
| `class_birthdays` | Manager-only roster, public daily-greeting function | Roster stays manager-only; daily-greeting function becomes authenticated-only and checks `auth.uid()` |
| `student_notes` | Anonymous reads; owner writes/admin removal | Authenticated reads; ownership/admin rules retained |
| `student_note_reports` | Private reports/admin moderation; public status IDs function | Privacy/column grants preserved; status function becomes authenticated-only and checks `auth.uid()` |
| Role/calendar helper functions | Some executable by PUBLIC/anon | Executable by authenticated, not PUBLIC/anon; trigger execution stays server-side |
| `materials` bucket | Previously public file delivery, editor upload/delete | Set private in place; metadata-linked files readable by signed-in users; editors/admins may also read orphan files for maintenance |
| `news-images` bucket | Private, but published images readable anonymously | Remains private; only authenticated published reads or manager access |
| `student-notes` bucket | Private, but referenced files readable anonymously | Remains private; authenticated referenced/own/admin reads; direct client upload/overwrite remains prohibited |

The new restrictive Storage guards also withstand broad legacy object policies for the three class buckets. They preserve scheduled-image hiding, note ownership/live-file deletion protection, teacher Editor/Admin write restrictions, and leave unrelated buckets outside their scope. Old restrictive note policies are scoped to authenticated users to avoid anonymous query plans referencing tables whose grants were revoked.

The migration updates **bucket privacy metadata only**, not stored objects. It does not delete/move/upload files, rewrite homework or timetables, backfill profiles, or promote/demote existing accounts. It is transactional and tested for repeat application without data changes.

## Manual steps — existing project

1. Back up the database and record bucket privacy/policies. Confirm you have a working existing Admin. Do not bulk-promote existing users.
2. Review the actual tables, functions and policies in your project. Useful read-only SQL:

   ```sql
   select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
   from pg_policies
   where schemaname in ('public','storage') order by schemaname, tablename, policyname;

   select id, name, public, file_size_limit, allowed_mime_types
   from storage.buckets order by id;

   select grantee, table_schema, table_name, privilege_type
   from information_schema.role_table_grants
   where grantee in ('anon','authenticated','PUBLIC')
   and table_schema in ('public','storage');
   ```

3. Check the migration history. The new migration requires `schema.sql`, `accounts.sql`, `20261011_class_news.sql` and `20261011_student_notes.sql`. Apply **only missing** prerequisites after reviewing them. The news/notes migrations were previously prepared but not applied by this chat. Older scripts contain historical public-read policies: do not rerun them after the new migration.
4. Review and manually run [20261015_authenticated_class_access.sql](../supabase/migrations/20261015_authenticated_class_access.sql) in Supabase SQL Editor **last**. It aborts if a required table is missing; don't remove the prerequisite checks or skip failed statements. It sets the existing three class buckets to private in place. If a `materials` bucket was never created, create it **private** manually before using teacher uploads.
5. In Authentication settings, leave **Allow new users to sign up ON**, with Email enabled, and leave **Confirm email OFF**. The signup form confirms the typed email and password locally, then expects Supabase to return an authenticated session immediately. These confirmation fields are typo checks only and are never sent as separate database values. No live Auth setting is changed by the code or SQL.

   Signup still explicitly sends `emailRedirectTo: https://cindychen125.github.io/Homework-Tracker/` (including the project path and trailing slash, without a hash route), preserving the correct canonical destination if confirmation is ever deliberately reintroduced. The released flow does not display a confirmation-email screen. If signup unexpectedly returns no session, it asks the student to try signing in and tells an administrator to verify that confirmation remains disabled.
6. Deploy/retain `upload-student-note` separately using the Phase 5 instructions. It is still required for note uploads; this migration does not deploy it. Keep service-role credentials only in the server function environment.
7. Confirm the GitHub Pages build serves the latest frontend. Pushing `main` starts the existing workflow, which never applies SQL or changes Supabase Auth/Storage settings.

**Frontend/backend transition:** the push may deploy before you complete these steps. Until the new migration is applied, old direct API access and old public URLs may remain accessible. Teacher downloads may report an error because the old schema did not grant the SELECT policy needed for signing links. Do not reintroduce public-URL fallbacks to work around this; complete the migration. Do not describe the live system as private based on the login page alone.

For a fresh installation, create the project and private `materials` bucket, then apply the same schema/account/news/notes/authentication sequence. Register an account as Reader; make only the explicitly chosen first administrator Admin with a targeted manual update. Never run the old bulk-admin backfill example. The commented backfill in `accounts.sql` now uses Reader and does not change existing profiles.

## Manual acceptance checks after setup

Use disposable, clearly identified test data in an approved staging project first. None of these hosted checks were performed automatically.

- With no session, test Today, Files, News and direct Post/People links: only the authentication page should appear. Refresh during checking: no protected-page flash.
- Register a new account and verify it enters Classboard immediately without a confirmation email. Verify its database profile is Reader, not Editor/Admin, and `news_manager=false`. Test spoofed metadata in staging: it must not elevate the account.
- Sign in, land on Today, refresh, and verify the session remains. Sign out from each role on phone/desktop, and check another open tab. Revisit protected links and use back/forward: no old class content should return.
- With the publishable/anon key and **no user JWT**, query each class table and invoke birthday/status RPCs: no class rows/greetings/status IDs should be returned. The key itself is intentionally public and must not confer class access.
- Try unauthenticated Storage listing/signing/downloading for all three buckets. Confirm they fail or return no protected objects. Test known old `/storage/v1/object/public/materials/...` URLs in a signed-out browser: they must no longer serve files. Also check class news/note public-URL variants. If cached public copies remain available, investigate Supabase/CDN caching before claiming privacy.
- As Reader, read homework/timetables/materials/published news/today's greetings/notes; verify homework, timetable, teacher-material and role mutations are denied. As Editor, those editing operations should work, but People/role management must remain unavailable. As Admin, test People. As a separate news manager, test only news/birthdays management, not homework editing.
- Verify Readers cannot fetch the birthday roster or moderation reports. Check future news/images remain hidden from ordinary users, and note owner/admin/report restrictions still hold.
- Open an existing teacher file and a note, then test upload/replacement/cleanup on approved staging data. Existing file bytes/paths and homework/account counts must be unchanged by migration.
- Test WeChat/mobile, keyboard tab order, announced errors, matching and mismatched signup fields, and sign-out failures. The automated in-memory renderer is not a substitute for real device testing.

## Security limits

Open registration lets any registrant read class content. Authentication is not verification of class membership or a school-email-domain restriction. Keep that trade-off in mind when uploading.

Private buckets prevent anonymous **public URL** downloads. A signed URL is a temporary bearer capability: anyone with a copied URL can use it until expiry, even after its creator signs out. Previously issued links may live up to their original TTL; downloaded files and previously cached public copies cannot be recalled by this code. If every file request must require a current session, use authenticated blob downloads/a server proxy instead of signed links as a separate change.

GitHub Pages serves application JavaScript, fonts and CSS publicly. The printed timetable constants and explicitly approved school-event constants are still bundled with the client; they are not secret records protected by RLS. The private reference PDF remains ignored and is not shipped. Do not embed confidential records or credentials into static source/assets.

No live settings, migrations, data, or accounts were changed by this work. Final backend privacy depends on completing the manual steps and validating the actual project, including custom policies/storage or endpoints not present in this repository.

## Automated verification

Tests cover the actual auth/session controller and React app without a browser, SDK persistence settings, profile lookup failures, role-based routes, signed material requests, and all migration SQL against in-memory PostgreSQL. SQL tests include all class tables/RPCs, private bucket flags, existing broad Storage policies, role/ownership rules, forged signup metadata, preserved fixture records, unrelated-bucket behavior, and idempotent reruns. Earlier migration tests intentionally retain their historical behavior; the latest combined migration tests define the final access rules.

Build/test commands: `npm test` (Node 24+) and `npm run build`. Nothing in these commands connects to or migrates the live project. No screen capture was used. Hosted authorization, cached-URL behavior, emails and physical-device rendering remain manual checks.

Local results for this change: **88 tests passed**, production TypeScript/Vite build passed, and whitespace checks passed. These are not a live Supabase or physical-device certification.

Dependency audit: `npm audit --json` still reports the pre-existing high-severity `source-map-js` indexed-source-map denial-of-service advisory ([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)). No broad dependency autofix was applied as part of this authentication change. The interface detector reports only the pre-existing guide layout transition; it was left out of scope.

References: [Supabase private/public buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [private file delivery](https://supabase.com/docs/guides/storage/serving/downloads), [auth state subscriptions](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), and [avoiding async auth-callback deadlocks](https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0).
