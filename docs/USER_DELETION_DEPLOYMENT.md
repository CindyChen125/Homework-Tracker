# Admin user deletion — manual deployment

The People page now calls a protected `delete-user` Supabase Edge Function. The frontend never receives the service-role key. Nothing in this change has been applied to the live project automatically.

## Data impact

- Supabase Auth account: permanently deleted by the Admin API.
- `profiles`: deleted by the existing `auth.users → profiles ON DELETE CASCADE` relationship.
- Student Notes: notes owned by that profile, reports on those notes, and reports submitted by that profile cascade from existing foreign keys.
- Student Note files: the Edge Function removes the matching objects from the private `student-notes` bucket after Auth deletion. A cleanup failure is reported as a warning rather than pretending the account still exists.
- Shared homework, timetable entries, schedule changes, teacher materials, class news, and birthdays: preserved. These tables do not use the deleted profile as an owner foreign key.

The database guard prevents deleting or demoting the final administrator. A reservation plus a Postgres advisory lock serializes concurrent admin-deletion requests. An abandoned reservation expires after ten minutes.

## Deploy after reviewing

1. Open the Supabase SQL Editor for the Classboard project.
2. Review and run `supabase/migrations/20261108_admin_user_deletion.sql` once. It creates only the deletion reservation/RPC and final-admin guard; it deletes no existing account or class record.
3. From this repository, sign in to the Supabase CLI and link the correct project if needed.
4. Deploy the function:

   ```sh
   supabase functions deploy delete-user
   ```

5. Confirm the function has its normal hosted secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Supabase normally supplies these to hosted functions. Never add the service-role key to a `VITE_` variable or frontend file.
6. Sign in as an admin and verify deletion first with a disposable Reader account. Confirm self-deletion and deletion of the final admin remain disabled/rejected.

Email/password authentication remains unchanged. Keep email confirmation disabled in the Supabase Dashboard as intended; this feature neither changes Auth settings nor introduces username authentication.
