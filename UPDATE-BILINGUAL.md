# Bilingual update - version 2.2.0

This package updates the existing registration portal. It does not deploy itself,
change your Vercel project, run SQL, or send acceptance emails.

## Included changes

- English/Arabic button in the top-right corner. Arabic uses a right-to-left layout.
- All school-facing screens, session labels, validation, dates, review details,
  already-submitted message, receipt, and printable summary are localised.
- Official Arabic school names are matched by school eSIS, not guessed or translated.
- Search accepts English names, Arabic names, eSIS and Arabic-form digits.
- Switching languages keeps the selected school, pathways, coordinator entry,
  teacher entries, selected regions, selected teachers, and acknowledgement values.
- An additional language button is available inside the teacher dialog so the user
  does not have to close the dialog or lose an unfinished entry.
- Only the language preference is kept in browser storage. Personal details are not.
- The success message and the two acknowledgement statements use the supplied wording.
- Both acknowledgement checkboxes start unchecked and are individually required.
  The server rejects a submission if either is missing, false, or not a boolean.
- Supabase stores the accepted statements, language, policy version and both values
  inside the existing request JSON payload. The existing Jotform Notes field receives
  this information for each mirrored session. Old records are not marked as having
  accepted these new statements.

The original rules remain: one complete submission per school; one teacher per
session; Al Dhafra chooses Abu Dhabi OR Al Ain for each regional pathway;
Performing Arts is in Abu Dhabi; the two Oral History dates are independent.
Requests remain Pending review. Automatic acceptance-email sending is not added.
No venues are displayed. Existing coordinator contacts remain server-only.
School access codes remain disabled when SCHOOL_ACCESS_SECRET is unset/empty.

## School names import

Source: `schools (9).csv`, retained as `data/school-names-bilingual.csv`.
All 286 existing schools matched by eSIS. Their teachers, coordinator records,
verification values, school regions and registered pathways were preserved.
The supplied file also has one additional school, eSIS `2114AD` (AlDhabi School).
It is included with its supplied Arabic name and region, no invented coordinator,
no registered pathways, and no nominated teachers. The school can add its details
through the existing workflow. That bilingual release contained 287 schools. The later
29 September teacher-data refresh increased the searchable directory to 290. The later manual
addition of `500AD` (Um Kolthoom Girls School) brings the current searchable directory to 291; see
`TEACHER-DATA-UPDATE.md` and `ADD-SCHOOL-500AD.md`. The teacher-data JSON report remains the historical report for the 29 September refresh.

## Do I need to run another Supabase migration?

**No.** This update uses the current v2.1 database tables and their JSONB payload.
The SQL files are unchanged from the Al Dhafra-fix package. Do not reset, delete,
or recreate your database. Existing submitted-school locks are preserved.

Your Jotform form ID, API key, Supabase URL/key and cron secret stay the same.
No new Jotform questions are required. Keep the existing question called `Notes`:
`npm run check:integration` now checks that this field is present as well.

## Update your existing GitHub / VS Code project

1. Download and extract the complete ZIP.
2. Back up your current project. Copy the updated files into your existing project
   root (the directory containing `package.json` and `vercel.json`). This is not
   an HTML-only update: copy `public`, `lib`, `api`, `data`, `scripts`, `tests`,
   `docs` and the other project files.
3. Keep your existing `.git` folder, `.vercel` folder, and private `.env.local` /
   `.env.production` files. None is included in the package. Do not copy your
   secrets into the example configuration, screenshots, source code or GitHub.
4. Leave SCHOOL_ACCESS_SECRET unset in Vercel and your local settings, as agreed.
5. In VS Code's PowerShell terminal, use an update branch:

```powershell
git switch -c bilingual-registration
npm test
```

The Node test suite does not write to your live database or Jotform.
To check your configured TEST connections without submitting a request:

```powershell
npm run check:integration
```

This command reads `.env.local`; ensure that file points to your TEST services.
A real test submission against LIVE still consumes that school's one-time request.

6. Stage, review, commit and push:

```powershell
git add .
git status
git diff --cached --stat
git commit -m "Add English and Arabic registration and required acknowledgements"
git push -u origin bilingual-registration
```

Do not commit `.env`, `.env.local`, `.env.production`, `.vercel`, API keys or access
code exports. `.gitignore` is included, but it cannot untrack secrets that were
already committed. Keep the repository private because the server dataset contains
school and teacher information.

7. Open the Preview URL on the connected Vercel project. Preview must use TEST
   Supabase and Jotform credentials, not LIVE. No further SQL is needed.
8. Verify the checks below, then merge the branch into your project's production
   branch (usually `main`). Vercel deploys the configured production branch.

Official deployment reference: https://vercel.com/docs/git/vercel-for-github

## Preview acceptance checks

- Toggle English/Arabic at the top-right. Confirm Arabic layout and school names.
- Search using an English name, Arabic name and school eSIS.
- Change language after choosing pathways and filling part of a coordinator form.
- Change language inside an unfinished Add Teacher dialog. Nothing should clear.
- For Al Dhafra choose one region, select a teacher, then choose the other region.
  The earlier selection must clear; requesting both regions must not be possible.
- At Review, try sending with neither acknowledgement, then only one, then the
  other one. Each incomplete case must remain on the review page without sending.
- With both checked, send a request in TEST. Confirm the exact success wording,
  selected-language school name, Supabase payload and Jotform Notes.
- Toggle language on the received screen; this must not submit the request again.
- Search for that school in another browser. It must show Already submitted.
- Check a mobile screen. Review and print show session dates/times, not venues.

## Test evidence and limitations

- `docs/unit-test-results.txt`: 74 passing local automated tests.
- `docs/browser-test-results.txt`: original registration journeys using API fixtures.
- `docs/once-browser-test-results.txt`: one-submission/retry behaviour using fixtures.
- `docs/bilingual-browser-test-results.txt`: bilingual state, form, acknowledgement,
  receipt and mobile tests. Arabic review layout checked at 320, 360, 390, 768 and
  1280 pixels. No browser JavaScript errors were observed.
- Browser tests use simulated APIs and preference storage because browser URL
  navigation is blocked in this environment. They are not a real Vercel deployment.
- Screenshots in `screenshots/bilingual` use synthetic schools and teachers.
- No live Supabase/Jotform end-to-end write or actual email delivery was performed.

The application changes are ready for your preview deployment; preview verification
in your connected environment remains necessary before merging to production.
