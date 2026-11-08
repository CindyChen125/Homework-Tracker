# Classboard — Development Update Plan

## Project Information

Repository: https://github.com/CindyChen125/Homework-Tracker

Classboard is an existing React, TypeScript, Vite, and Supabase
application for managing homework and class information.

This document contains the requirements for the next major update.

## IMPORTANT: Instructions for Codex

1. Read this entire document before making changes.
2. Inspect the existing repository and understand its architecture.
3. Do not rebuild Classboard from scratch.
4. Preserve existing functionality unless explicitly instructed otherwise.
5. Reuse existing components, styles, authentication, and data models.
6. Work in phases, not all at once.
7. Complete Phase 1 (inspection) and present your plan before editing code.
8. After each implementation phase, summarize changes and wait for approval.
9. Do not commit, push, deploy, or modify production data without permission.
10. Do not apply Supabase migrations without explicit approval.
11. Do not expose private school information.
12. Ask questions when important requirements are ambiguous.

---

# Phase 1 — Repository Inspection and Preparation

Before implementing features:

- Read README.md.
- Inspect the React application structure.
- Review the Today, Materials, and related pages.
- Understand the existing homework and calendar logic.
- Review Supabase authentication, database tables, and RLS policies.
- Identify reusable components.
- Check available tests and build commands.

Explain your proposed implementation approach before proceeding.

## Protect the Private Academic Calendar

The official academic calendar is already stored locally at:

`reference/academic-calendar.pdf`

This file is private and MUST NOT be committed to GitHub.

Update `.gitignore` to include:

```gitignore
/reference/
```

Requirements:

- Keep the entire reference directory out of Git.
- Verify that the academic calendar is not tracked.
- Do not commit or push the original document.
- Do not upload it to Supabase Storage.
- Do not publish it in Materials.
- Do not include the original PDF in production build assets.
- Do not move it into the public directory.
- Do not copy its contents into a publicly accessible file.
- Use it locally only as a reference for extracting academic dates.

If the file is already tracked by Git, STOP and inform me.

Do not assume adding it to `.gitignore` removes it from Git history.

Do not rewrite Git history without my permission.

The interactive calendar may use the extracted dates, but before
publishing them, identify any information that might be private
and ask me to approve what will be displayed.

---

# Phase 2 — Today Page Improvements

## Existing Behavior

Currently:

- When the selected date is today, Classboard displays homework
  due on the next school day.
- When another date is selected, Classboard displays homework
  due on that selected date.

Keep this behavior, but improve today's view.

## Section 1: Due Next School Day

Display all assignments due on the next school day.

Include:

- Homework
- Projects
- Tests
- Other assignments

Use the existing school-day calculation, including holidays
and make-up school days.

## Section 2: Coming Up

Display all assignments due AFTER the next school day.

Requirements:

- Include every future deadline, regardless of how far away it is.
- Do not impose a 14-day or 30-day limit.
- Include all assignment types.
- Sort by due date, earliest first.
- Group assignments by due date.
- Avoid duplicates between sections.
- Make the section collapsible.
- Expand it by default.
- Provide an appropriate empty state.

## Other Dates

When the selected date is not today:

- Preserve the existing behavior.
- Show assignments due on that exact date.
- Preserve the current headings for past and future dates.

## Important

Do NOT add a "Due Today" section.

For now, assume assignments due today have already been submitted.

Preserve:

- Existing homework calendar
- Homework checkboxes
- WeChat message generator
- Homework posting functionality

After implementation, test the date logic and stop for approval.

---

# Phase 3 — Interactive School Academic Calendar

## Purpose

Add a separate interactive SCHOOL academic calendar.

Classboard already has a homework calendar.

DO NOT remove or replace it.

## Source

Read:

`reference/academic-calendar.pdf`

Extract the official academic dates carefully.

Possible events include:

- School holidays
- Semester dates
- Examination periods
- Special school days
- Important school events
- Other dates explicitly listed in the document

Do not invent information.

If any date or event is ambiguous, ask for clarification.

## Interactive Calendar

Implement:

- Monthly calendar view
- Previous/next month navigation
- Clickable dates
- Event details
- Event categories
- Clear visual distinctions
- Responsive design
- Accessible controls

Use Classboard's existing visual style.

Choose an appropriate navigation location.

Keep the existing homework calendar unchanged.

## Privacy Requirements

The original academic calendar PDF must remain local.

Do not:

- Commit it
- Push it
- Upload it
- Publish it
- Make it downloadable
- Automatically add it to Materials

The original document may be added to Materials in the future,
but only after separate permission.

Before publishing extracted events, show me what information
will be displayed and request approval.

## School-Day Logic

If the official calendar contains information relevant to
school holidays or make-up days, compare it with the existing
school-day logic.

Do not silently overwrite existing rules.

Report conflicts and ask how to resolve them.

Stop after implementation and testing for approval.

---

# Phase 4 — Class News

## Purpose

Add a Class News feature for announcements, achievements,
birthdays, and other class updates.

## Today Page

Add a compact Class News section.

Requirements:

- Show recent news.
- Display title, date, category, and preview.
- Support optional images.
- Support pinned announcements.
- Include a "View All" link.
- Keep homework as the primary focus of the Today page.

## News Archive

Create a page or view for older announcements.

Categories:

- Announcements
- Achievements
- Birthdays
- Other

## News Management Permissions

Only the following users may manage Class News:

1. Administrator
2. Accounts explicitly granted `news_manager` permission

The homeroom teacher will eventually receive this permission.

However, her account has not yet been identified.

Therefore:

- Do not invent or create a teacher account.
- Do not hardcode an unknown teacher email.
- Do not grant teacher permissions to an arbitrary account.
- Do not give the teacher unrestricted administrator privileges.
- Implement a configurable `news_manager` permission.
- Allow the administrator to assign this permission later.
- Ensure ordinary homework editors do not automatically receive it.

Enforce these restrictions through Supabase RLS.

Do not rely only on hiding buttons.

## Automatic Birthday Greetings

Implement basic automatic birthday greetings.

Store only:

- Student display name
- Birth month
- Birth day
- Necessary consent/visibility information

Do NOT store birth year.

Birthday records may be managed only by:

- Administrator
- Authorized news managers

Requirements:

- Show a birthday greeting on the student's birthday.
- Display it in the Today page's Class News section.
- Support multiple birthdays on the same day.
- Do not create duplicate greetings.
- Remove the greeting automatically from view the next day.
- Do not store automatic birthday greetings in news history.
- Do not display them in the news archive.

Only display a student's birthday with their permission.

Do not expose the complete birthday roster to ordinary users.

Use appropriate database access policies.

## Deferred Birthday Features

Do NOT implement yet:

- Collaborative birthday cards
- Virtual birthday cakes
- Shared wishes
- Balloons
- Gift boxes
- Other interactive birthday celebrations

These are future improvements.

Stop after implementation and testing for approval.

---

# Phase 5 — Student-Contributed Notes

## Purpose

Expand the existing Materials section.

Separate it into:

1. Teacher Materials
2. Student Notes

## Teacher Materials

Preserve existing teacher/editor resource functionality.

Only authorized editors and administrators may upload or
manage teacher materials.

Ordinary students must not be able to upload into this section.

Organize resources by subject.

## Student Notes

Allow any authenticated student to upload notes directly.

There is NO pre-publication approval process.

Notes become visible immediately after submission.

Each submission should support:

- Subject
- Title
- Optional description
- File attachment
- Contributor
- Upload date

Supported formats should include:

- PDF
- Images
- Word documents
- PowerPoint presentations

Implement sensible file size and type restrictions.

Validate uploads securely.

Use Supabase Storage where appropriate.

## Ownership

Students may:

- Upload notes.
- Edit their own notes.
- Delete their own notes.
- View other students' notes.
- Report errors.

Students may NOT:

- Edit another student's notes.
- Delete another student's notes.
- Access private moderation reports.

Administrators may moderate and remove any student note.

The homeroom teacher is not expected to review submissions.

## Report an Error

Every student-contributed note should include a:

**Report an Error**

button.

Report categories:

- Incorrect information
- Missing information
- Wrong subject/category
- Inappropriate content
- Other

Allow an optional explanation.

Requirements:

- Only authenticated students may submit reports.
- Prevent duplicate reports from the same account on the same note.
- Keep reports private.
- Provide an admin moderation interface.
- Allow admins to dismiss reports.
- Allow admins to remove problematic notes.
- Do not automatically delete notes based on reports.
- Display an "Under Review" indicator when a note has
  an unresolved report.
- Do not reveal the reporter's identity publicly.

Display this label on student notes:

"Student-contributed · Not officially verified"

## Security

Implement database and storage permissions that ensure:

- Students can manage only their own notes.
- Ordinary students cannot modify teacher materials.
- Reports are not publicly readable.
- Only admins can access the moderation queue.
- Unauthorized users cannot delete files.
- File uploads are appropriately validated.

Stop after implementation and testing for approval.

---

# Phase 6 — Integration and Final Testing

After all approved features are implemented:

Run available checks:

- TypeScript
- Production build
- Linting, if configured
- Existing automated tests
- New tests for important functionality

Test the following roles:

- Unauthenticated visitor
- Ordinary student
- Homework editor
- News manager
- Administrator

Verify:

- Today page date behavior
- Future assignment ordering
- Calendar navigation
- Calendar privacy
- Class News permissions
- Birthday visibility and timing
- Student note ownership
- Error reporting
- Supabase RLS restrictions
- Supabase Storage restrictions
- Mobile layouts
- Existing features still work

Do not claim tests passed unless they were actually run.

---

# Supabase Migration Rules

Several features may require new database tables,
policies, storage buckets, or permissions.

IMPORTANT:

1. Inspect existing Supabase configuration first.
2. Create migration files as needed.
3. Explain each migration.
4. Show the migration SQL for review.
5. Do not apply migrations to the live database without approval.
6. Do not modify production records without approval.
7. Avoid destructive schema changes.
8. Preserve existing user accounts and data.
9. Implement database-level authorization.
10. Test policies using appropriate user roles.

Do not use the Supabase service-role key in frontend code.

Do not expose secrets or credentials.

---

# Features Deferred Until Later

The following features are NOT part of this implementation.

## Cleaning-Duty Schedule

The class has not finalized its cleaning schedule.

Potential future functionality:

- Daily responsibilities
- Weekly cleaning timetable
- Student assignments
- Today's cleaning duties

Wait for further instructions.

## Interactive Features

We are considering:

- Class polls
- Weekly trivia
- Class goals
- Other interactive activities

Class polls are a promising idea, but requirements
have not been finalized.

Do not implement them yet.

## Interactive Birthdays

Potential future features:

- Collaborative birthday cards
- Virtual cakes
- Shared birthday wishes
- Balloons
- Gift boxes

Do not implement yet.

## Due Today Section

We may eventually add a section for assignments
due on the current date.

Do not implement it now.

---

# Design Guidelines

Maintain the existing Classboard visual identity.

Prioritize:

- Readability
- Clear information hierarchy
- Responsive design
- Mobile usability
- Accessibility
- Consistent components
- Simple navigation
- Good performance

Avoid overcrowding the Today page.

Homework should remain the primary focus.

Reuse existing components and patterns whenever possible.

Avoid unnecessary dependencies.

---

# Required Development Workflow

Follow this exact process:

### Step 1 — Inspect

Read the repository and this document.

Identify architectural considerations and risks.

Present an implementation plan.

WAIT FOR MY APPROVAL.

### Step 2 — Implement Today Page Improvements

Implement and test Feature 1.

Summarize changes.

WAIT FOR MY APPROVAL.

### Step 3 — Implement Academic Calendar

Read the local reference document.

Extract and verify events.

Request approval before publishing extracted information.

Implement and test the calendar.

WAIT FOR MY APPROVAL.

### Step 4 — Implement Class News

Create necessary database migrations.

Present migrations for review.

Do not apply them without approval.

Implement news management and birthdays.

Test permissions.

WAIT FOR MY APPROVAL.

### Step 5 — Implement Student Notes

Create necessary database and storage migrations.

Present them for review.

Do not apply them without approval.

Implement uploads, ownership, reporting, and moderation.

Test permissions.

WAIT FOR MY APPROVAL.

### Step 6 — Final Testing

Run all relevant checks.

Review integration and regressions.

Provide a final report.

WAIT FOR MY APPROVAL before any deployment.

---

# Final Report Requirements

When implementation is complete, provide:

1. Features implemented
2. Files changed
3. Database migrations created
4. Required Supabase setup
5. Manual configuration steps
6. Tests performed and results
7. Known limitations
8. Privacy/security considerations
9. Deferred features
10. Recommended next steps

Do not commit, push, or deploy without explicit permission.

Do not apply production migrations without explicit permission.

Do not expose the private academic calendar.

The goal is to improve Classboard incrementally while
preserving its existing functionality and protecting
students' information.
