# Classboard

A homeroom homework board for G8 (5). One editor (the class rep or the teacher) adds each day's homework plus long-term projects
and tests; classmates sign in from the WeChat group link to see today's homework and a
calendar of what's coming up. The Today page also writes the daily group-chat message,
with automatic reminders for projects/tests due in the next 14 days.

## Pages

| Route | Who | What |
|---|---|---|
| Any route while signed out | visitors | Dedicated Sign In / Sign Up page only; no class-page navigation or class-data requests. |
| `#/` | signed-in users | One day at a time: what is due (on today, the next school day's hand-ins), the month calendar, and (for editors) the **Copy** group-chat message. `#/?d=2026-10-08` opens a particular date. |
| `#/schedule` | signed-in users | The weekly timetable with bell times. An editor can swap two classes — on the same day or across days — or cancel one, for a single date or for good. |
| `#/school-calendar` | signed-in users | Approved school dates, selectable month grid, category filters, event details and monthly agenda. Separate from the homework calendar. |
| `#/news` | signed-in users | Class News archive and category filters. Admins/authorized news managers also manage posts and private birthday settings. |
| `#/materials` | signed-in users | Private downloads. Editors upload teacher materials; students upload/edit their own notes. |
| `#/post` | editors/admins | Add / edit / delete homework. Readers are redirected to Today. |
| `#/people` | admins | Every account, and what each one may do. |

## Accounts

Sign-in is required throughout the app. Anyone may register with an email address. New accounts receive **Reader**, never Editor or Admin; Readers can view class content and share their own student notes, but cannot edit homework/timetables/teacher materials or access administration. Admins assign the existing Editor/Admin roles on People. News management remains a separate permission.

The session is persisted by Supabase across refreshes. Initial authentication/profile checks show a loading state; protected pages load only after success. Sign-in opens Today. Every signed-in role has a Sign out button at the bottom of the unified sidebar; on phones, open the top-left menu first. Missing/error profiles default to Reader and never grant editing/news-management fallback permissions.

## Responsive navigation

One sidebar serves every signed-in page; there is no bottom navigation. Desktop (1024px+) defaults to 220px and can collapse to a 60px rail, pushing the page in either state. Tablets (768–1023px) default to a 60px rail and expand as a dimmed overlay. Phones start with the menu closed and open a 220px overlay from the top-left menu button.

Desktop and tablet preferences are saved separately in localStorage. Overlay navigation closes on selection, backdrop click or Escape, traps focus, locks background scrolling and returns focus to the opener. Guide, Theme, account information and Sign out stay near the bottom; short sidebars scroll. Role badges use the actual profile role, including **Admin** on narrow screens. See [sidebar behavior and verification](docs/SIDEBAR.md).

**Manual backend setup is required:** follow [Authentication deployment and policy review](docs/AUTHENTICATION_DEPLOYMENT.md). The new migration is prepared, not applied. Frontend deployment alone does not close old direct API/public-file access. Leave open registration enabled. The current signup flow expects **Confirm email** to be disabled so a new student receives an authenticated session immediately.

Open registration is not a class-membership check: anyone who registers can read the class content. Do not treat the login page as an invitation-only boundary.

## Run locally

```bash
npm install
npm run dev
```

With no Supabase configuration, the app shows a sign-in setup notice and does not expose a demo Admin session. Existing local demo data is not deleted, but the authenticated application requires Supabase.

## How the rules work

- **Coming Up on Today** shows every assignment due after the next school day, grouped by date with no time limit. It is expanded by default and can be collapsed. Other selected dates still show only that date's assignments.
- **Group-chat reminders** retain their separate 14-day window. The longer Coming Up list does not make the chat message longer.
- **The homework calendar** only shows projects, tests and homework due later than the next school day.
  Everyday homework stays on the Today page and in the chat message.
- **A star** marks any day with a test; a lime dot marks projects.
- **The timetable** is a weekly grid (`src/lib/schedule.ts` holds the printed one) plus
  per-date changes, so a one-off swap never affects the following week. Changes for the next
  school day are added to the group message automatically.
- **Ticked-off homework** is saved per student, in their own browser only.
- **School Calendar** is a separate page under School, with month navigation, selectable dates, category filters and an event agenda. Only reviewed, explicitly approved academic events are included; the original PDF is never served. Dates may change, and unannounced dates are not guessed.
- **School breaks** are maintained separately from national holidays. The approved winter break is skipped by next-school-day calculations; existing make-up days remain unchanged. A computed school day after a break is not an announcement of the next term's start.

## Connect Supabase (shared data)

Use the [manual deployment guide](docs/AUTHENTICATION_DEPLOYMENT.md) for an existing project or fresh installation. Create teacher `materials` as a **private** bucket on new installations. Apply the authentication migration last, after the base/account/news/notes schemas. Never rerun old public-read migrations after it.

Configure `.env.local` from `.env.example` using only the project URL and publishable/anon key. Never put a service-role key in frontend environment files. New users sign up normally as Readers; any initial admin assignment must be an explicit, targeted manual action, not a bulk promotion.

## Deploy

`npm run build` produces a static site in `dist/` (relative paths, hash routing), so it works on
any static host. In mainland China, `*.vercel.app` and `*.pages.dev` are often unreachable in
WeChat — pick a host classmates can actually open, then pin the link in the group.

Pushing `main` triggers the existing GitHub Pages workflow. It does **not** run SQL or deploy Supabase functions. Teacher downloads use one-minute signed links (Get file → Open); public storage URLs must stop working after the manual bucket-privacy migration. Copied signed links remain usable until expiry; existing downloaded copies cannot be revoked.

## Code map

- `src/lib/store.ts` — data layer: Supabase, or localStorage in demo mode
- `src/lib/auth-session.ts` — fail-closed session lifecycle, subscription cleanup and stale-request protection
- `src/lib/access.ts` — editor/admin route guards
- `src/pages/Auth.tsx` — dedicated Sign In / Sign Up page
- `src/lib/homework.ts` — "coming up" rules and the group-chat message text
- `src/lib/pagination.ts` — fetches all homework pages so older records do not hide future deadlines
- `src/lib/dates.ts` — local `YYYY-MM-DD` date helpers
- `src/lib/schedule.ts` — bell times, the printed timetable, and how changes are applied
- `src/lib/holidays.ts` — public holidays, make-up days, and separately approved school breaks
- `src/lib/academic-calendar.ts` — school calendar grids, inclusive event ranges and month navigation
- `src/lib/academic-events.ts` — approved school events only; never imports private reference files
- `src/pages/SchoolCalendar.tsx` — separate school calendar, details and month agenda
- `src/pages/` — authenticated Today, Schedule, Materials, Post (editor-only), People (admin-only), News and School Calendar
- `src/components/Tour.tsx` — the guided tour that dims the page and lights one part at a time
- `src/components/` — shared UI (cards, timeline, month grid, icons)
- `src/styles.css` — the theme; every colour is a CSS variable at the top, light and dark

The font (Plus Jakarta Sans) is bundled via `@fontsource` rather than Google Fonts, which is blocked in mainland China.

## Checks and private references

Run `npm test` with Node.js 24 or newer. Tests cover authentication transitions, real in-memory React rendering, role guards, session configuration, private download requests, homework/calendar/news/notes behavior, and the actual SQL/RLS migrations in local PostgreSQL. No live project is contacted. TypeScript stripping may print an experimental warning. Run `npm run build` for TypeScript and the production build; the Node.js 20 deployment build remains supported.

`reference/` is ignored by Git. Keep the private academic calendar there for local reference only; do not place it in public assets or upload it as a material.

## Class News setup (Phase 4)

Review [the Phase 4 implementation and setup notes](docs/PHASE_4_CLASS_NEWS.md) and [the migration SQL](supabase/migrations/20261011_class_news.sql) before applying anything. The migration is prepared but **not applied**. News management is a separate `news_manager` permission, assigned by an admin on People; homework editors do not automatically receive it. No teacher account has been selected.

Birthday records have no birth year and remain manager-only. A date-restricted function exposes only today's consented display-name greetings. Greetings disappear after school midnight (UTC+8) and do not enter the archive. The app never fetches the full roster for ordinary visitors.

`npm test` now includes in-memory PostgreSQL tests of the actual news/birthday/Storage RLS rules. Hosted Storage behavior still needs staging verification after setup approval. No live migration or data changes are made by the tests.

## Student Notes setup (Phase 5)

Files now separates Teacher Materials from Student Notes. Signed-in students publish immediately, edit only their own notes and report errors privately. Admins can dismiss reports or remove notes. Teacher upload permissions are unchanged.

Review [Phase 5 setup and security notes](docs/PHASE_5_STUDENT_NOTES.md) and [the migration SQL](supabase/migrations/20261011_student_notes.sql). Neither the migration nor the secure `upload-student-note` function has been applied/deployed. Both are required for shared uploads. Files support PDF/images/Word/PowerPoint up to 20 MiB each (demo: under 1 MB); total capacity depends on the project's storage allowance.

The notes bucket is private, with short-lived downloads. After the authentication migration, notes and contributor display names are visible only to signed-in users; moderation reports remain admin-only. Upload format checks are not antivirus. Keep all service-role secrets server-side.

`npm test` also covers notes validation, ownership, reports, real local PostgreSQL RLS, restrictive storage guards, and the upload handler with mocked services. Hosted integration requires separately approved staging setup.
