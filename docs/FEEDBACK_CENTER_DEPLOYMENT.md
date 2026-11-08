# Feedback Center — manual Supabase setup

Nothing in this update applies SQL or changes the live Supabase project automatically.

## Apply the migration

1. Open the Classboard project in the Supabase Dashboard.
2. Open **SQL Editor** and create a new query.
3. Copy the complete contents of `supabase/migrations/20261108_feedback_center.sql` into the editor.
4. Review the project name, then choose **Run** once.
5. A successful run ends with `Success. No rows returned` (the exact Dashboard wording may vary).

The migration requires the existing `profiles` table and `my_role()` function from `supabase/accounts.sql`. It creates only `feedback_reports`, `feedback_replies`, their indexes, attribution triggers, grants, and RLS policies. It does not modify existing homework, files, users, news, calendars, or roles.

No Edge Function, Storage bucket, secret, redirect URL, or additional Supabase Dashboard setting is required. Feedback has no attachments and uses the signed-in user's profile directly.

## Verify before release

Use disposable reports rather than real student information for the first check:

1. As a Reader, create one public and one private report. Confirm both start as **Open**.
2. As another Reader, confirm the public report is visible and replyable, while the private report is absent even through a direct API query.
3. As the private report's author, confirm it and its replies remain visible.
4. As an Admin, confirm all reports are visible, status changes work, and deleting a report removes its replies.
5. As a Reader or Editor, try direct API updates to `status`, protected author/visibility fields, and deletes. They must be denied.
6. Sign out and query both feedback tables with only the publishable key. No rows or writes should be allowed.
