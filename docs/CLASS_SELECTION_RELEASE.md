# Class selection release

Apply `supabase/migrations/20261117_profile_classes.sql`, then `supabase/migrations/20261117_homework_visibility.sql`, then `supabase/migrations/20261117_edit_profile_classes.sql` in the correct Supabase project's SQL Editor before pushing the frontend. If the first two have already succeeded, run only the final migration. Do not rerun the older `accounts.sql` or authentication migration: they contain historical versions of the signup trigger.

Then commit the intended source and migration files (excluding `tsconfig.tsbuildinfo` and `supabase/.temp/`) and push `main` to start GitHub Pages deployment. No Auth Dashboard changes are needed.

New students choose EC, EE, and Math during signup. Existing accounts keep their role and data. A browser holding an old session signs out once, asks for the account's usual email and password, then presents the three class choices. After saving, the existing persistent Supabase session continues across refreshes. On a new device, the user signs in normally and only sees the choice screen if the profile is incomplete.

Verify with one existing Reader and one Editor/Admin account: sign in, save all three choices, refresh, and confirm the roles and existing class data are unchanged. Check a new signup gets Reader and the selected values. The migration does not invalidate Supabase sessions server-wide; the one-time sign-out is a browser-side release behavior.

For homework, Readers and Editors see only their chosen EC, EE, and Math subjects. Admins see all subjects. Subjects not in those 12 mapped options (including custom subjects and Other) remain visible to everyone. Verify Today, Coming Up, the homework calendar, the message preview, and the Add page as an Editor. The restrictive database policies also limit direct reads and writes to mapped subjects. Existing homework rows are not changed.

Settings lets signed-in users correct their own classes. After saving, check that the homework list reflects the new choices and the account stays signed in. Settings also offers Light/Dark mode, displays the account name and email, and changes the password through Supabase Auth. A password update may require reauthentication if the project's Auth security settings demand it; the form displays Supabase's error.
