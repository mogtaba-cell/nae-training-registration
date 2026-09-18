# NAE Training Registration Requests - version 2.1

**This release enforces one complete workshop-request form submission per school. It retains the three-page registration-request workflow and one teacher per session within that submission. For an existing v2 installation, start with [UPGRADE-ONCE.md](UPGRADE-ONCE.md).**

The existing Jotform form is `262592775577071`, titled **NAE Training Registration Requests 2026**. Its new `Request Status` field defaults to **Pending review**. Selection/approval emails are an administrator's later action; this application does not send acceptance emails automatically.

## Before deploying

The included Supabase/PostgreSQL schema stores one durable school submission lock keyed by the school's eSIS, in addition to its unique `(school_esis, session_id)` pairs. A returning school cannot send another form, even for different sessions or from a different browser. A database trigger protects request-header inserts; a browser control alone cannot enforce this. The upgrade marks all schools with existing stored requests as submitted without deleting their history.

**Do not deploy only the `public` folder. Complete the one-time setup in [DEPLOYMENT.md](DEPLOYMENT.md), then deploy the entire project. Without the database variables, submission is deliberately disabled.**

## The new three-step journey

### 1. School details

Search the school list instantly in a dropdown. Schools with stored requests are marked **Already submitted**. Selecting one checks the current database status and displays a non-editable submitted notice instead of the coordinator/pathway form. Only basic school identity and the submitted flag are returned, not its roster or receipt. Review the school's current pathways and add others where needed. Competition pathways are Literary Arts and Performing Arts. Participation pathways are Visual Arts, Digital Arts and Applied Arts. Existing values are preselected. Changing the selection records the original and requested lists separately; it does not silently overwrite the source workbook.

The school must acknowledge that it has reviewed the pathways. Oral History is not included in this official pathway selector.

A coordinator is labelled **Verified** only when `Coordinator Verified` is `Yes` in the supplied workbook. An unverified listed coordinator has mutually exclusive **Confirm this coordinator** / **Change coordinator** choices. A missing coordinator opens the new-coordinator form immediately.

Adding or changing a coordinator requires all eight specified fields: English name, Arabic name, eSIS/PASS, position/designation, Emirates ID, work email, primary email and contact mobile. Confirming an existing coordinator does not unnecessarily request details already held. Confirmation by the school is recorded separately from source verification; it does not automatically promote the coordinator to `Verified on file`.

Existing coordinator email/mobile and identity details are not sent in public API responses. Only the name and verification state are displayed. The review page also displays the name and action only.

### 2. Training registration

Each dated workshop is its own card: subject, region, date and time, followed by the eligible teachers and a single-choice radio control. No venue appears in the portal or its public session API.

**One teacher per school per actual session.** Selecting a new name replaces the previous selection. The same teacher may be selected for different sessions. Each Oral History date has its own one-person allowance; the same teacher or different teachers can be requested for the two dates.

The additional-teacher action lives inside the relevant session card. Its six required fields are English name, Arabic name, eSIS/PASS, position/designation, work email and contact mobile. A newly added teacher can be reused for other sessions without re-entering details. There is no separate Additional Teachers page.

A listed teacher missing an eSIS/PASS identifier is asked for it when selected. The import does not invent an official identifier. Applied Arts routing banners have been removed. Applied Arts remains an official school participation option; no separate Applied Arts workshop is invented.

Regional rules:

- Abu Dhabi schools see their Abu Dhabi Literary, Digital and Visual sessions.
- Al Ain schools see their Al Ain Literary, Digital and Visual sessions.
- Al Dhafra schools choose **one training region per pathway** for Literary Arts, Digital Arts and Visual Arts: Abu Dhabi **or** Al Ain. Only the selected regional session opens for teacher selection, and the backend rejects attempts to request both regions for the same pathway.
- Performing Arts and both Oral History dates are in Abu Dhabi for every school region.
- Oral History remains available to every school/teacher, including schools with no registered pathways or listed teachers.

Existing teacher pathway eligibility is retained. An Applied Arts nomination does not by itself make its teacher eligible for other arts workshops; any other explicit nominations remain available. Additional teachers who are not restricted listed nominees may request the school's selected workshops.

The review page warns about a teacher's overlapping session times; this is advisory and does not invent an extra approval rule.

### 3. Review and submit

Review one teacher per requested session, school pathways, and coordinator name/action. The acknowledgement says to include all workshop requests now: a school can submit only once, and attendance remains subject to review. The success screen says **Pending review**, provides a stable request reference and a printable summary, and has no Register another school button.

## Source data

The current private dataset was rebuilt from `Schools49(1).xlsx`:

| Import check | Result |
| --- | ---: |
| Schools | 286 |
| Nonblank teacher-pathway source rows | 1,192 |
| Consolidated school-teacher records | 825 |
| Verified coordinators on file | 59 |
| Listed coordinators awaiting confirmation | 219 |
| Schools without a coordinator | 8 |
| Schools without listed teachers | 65 |
| Schools without registered pathways | 53 |

Blank formatted rows in the workbook are ignored. Teachers are consolidated by school and eSIS/PASS; when that identifier is absent, name/email are used only for an internal stable record key. There is one consolidated teacher lacking an official identifier; the portal requests it on selection. The school pathway sheet is authoritative; teacher nominations do not silently add pathways to a school's official list.

`data/import-report.json` records the import checks. The workbook has not been changed. No CSV or private dataset is placed under `public/`.

To import a future workbook with the same headings, install Python/openpyxl locally and run:

```powershell
python scripts/import_workbook.py "C:\path\Schools49.xlsx"
```

The current schedule is retained unless `--schedule` is supplied. No future import should overwrite a production database or approved requests without administrative review.

## Storage, reporting and reliability

The server validates all choices against the private master dataset. A Postgres function saves a complete school request and every selected session in a single transaction. If the school already submitted, the entire new batch is rejected even for previously unrequested sessions. If a first request fails, its tentative school lock and all records roll back together. A stable request ID and payload hash make a retry idempotent; changed details cannot be replayed under a previously accepted reference.

Supabase is the durable request/uniqueness store. Jotform is the administrator reporting and review destination, with one record per teacher/session. A request is committed to the database **before** its Jotform mirror is created. Jotform unavailability therefore does not discard a school's request or release its uniqueness protection.

An outbox records mirror progress. Immediate synchronization is attempted, and a protected daily Vercel cron retries pending items. Ambiguous writes (for example a lost network response after Jotform may have accepted the record) are held for review instead of blindly posting again. Use `scripts/reconcile-sync.js` to match those records by Portal Registration ID. It never creates another Jotform submission.

Jotform review status changes are not automatically synchronized back into the database. They do not reopen a school's form. Approval emails are not automated. The administrator should use Jotform for the review and subsequent communications, and the protected database view to check sync health.

Legacy genuine submissions from the previous version are not silently interpreted as new requests. Follow the migration instructions before launch if there are any real records that must mark schools as already submitted. Legacy session records are grouped by school for the new one-time rule.

**Distribute only the portal URL to schools.** Restrict the backend Jotform to your administrative workflow. Direct/manual submissions into Jotform bypass the portal database; do not use them to add extra school/session requests without also updating the protected request records.

## Security and school identity

All database and Jotform keys are server-only. Tables have row-level security enabled with no anonymous policies; database functions are callable only with the server secret credential (which uses the service_role role). Stored coordinator contact information and Emirates ID never appear in public reads. Submitted new details exist in the user's form while being entered, then are stored privately for administrative review.

**A Verified coordinator badge is a source-data status, not proof of the current visitor's identity.** An optional per-school access-code gate is included. Set `SCHOOL_ACCESS_SECRET`, generate codes using the supplied script, and distribute each school's code only to its authorized contact. Without this gate, a visitor with the portal link can look up school rosters and submit on a school's behalf. Enable the gate before distributing the public link, or place the application behind your organization's equivalent school authentication.

No form drafts containing personal information are written to browser local storage. There are no analytics scripts or external fonts. Configure organizational access, retention, hosting-region and identity-data handling requirements before collecting Emirates IDs. This package does not assert regulatory compliance.

## Running and testing

Use Node.js 22. There are no third-party runtime dependencies.

```powershell
npm test
npm run dev
```

For a local interface-only preview, set `LOCAL_PREVIEW_ONLY=true` in `.env.local`. It displays a preview notice and **does not accept submissions**. This mode is ignored on Vercel.

Read-only live integration check, after adding credentials:

```powershell
npm run check:integration
```

The code was tested with 56 local automated tests plus desktop/mobile browser journeys using safe API fixtures and simulated submission responses. These cover routing, the single-choice interface, server validation, coordinator actions, required fields, missing identifiers, private response fields, Jotform field serialization, school-wide API conflict handling, loss-of-response retries, returning schools, and safe failure when storage is absent. **The tests do not constitute a live deployment test, a real Supabase transaction run, or a real Jotform API submission.** Run `database/smoke-test.sql` in your configured database and make a controlled end-to-end test request before launch.

## Reference documentation

- Jotform API: https://api.jotform.com/docs/
- Supabase database functions / SQL Editor / access restrictions: https://supabase.com/docs/guides/database/functions
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- PostgreSQL uniqueness enforcement: https://www.postgresql.org/docs/18/index-unique-checks.html
- Vercel deployment: https://vercel.com/docs/cli/deploy
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Vercel cron usage and scheduling limits: https://vercel.com/docs/cron-jobs/usage-and-pricing

This package has been prepared locally. It has not been deployed into your Vercel account.
