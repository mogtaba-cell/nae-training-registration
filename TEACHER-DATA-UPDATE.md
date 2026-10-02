# Teacher/coordinator data refresh - 29 September 2026

This update refreshes the private school-person roster from the supplied
`allteachersschoolcoordinators (26)(1).csv` file and keeps all existing session,
routing, one-submission, bilingual, and closed-session rules.

## What changed

- Replaced the previous teacher roster with **1,093 usable teacher/coordinator records** from the attached CSV.
- English person names were normalized from inconsistent ALL CAPS/lowercase source values to readable title case. Arabic names are kept as supplied; placeholder values such as `0`/`n/a` are treated as missing instead of displayed as names.
- Teacher eSIS/PASS, work email, mobile, designation, session pathways, specialization pathway, and school relationship were refreshed from the source.
- `Session Pathway` continues to control the teacher's pathway-linked suggestions in the UI.
- `Specialization Pathway` is now retained privately on the teacher record and is used for Jotform **Original Nomination Pathway** when supplied.
- Any person on the school's record can still be chosen through **Select a teacher from record**, regardless of their original/session pathway.
- Rows marked `School Coordinator` refresh the coordinator's name, Arabic name, eSIS/PASS, designation, work email and mobile. The existing **Verified** state is preserved only when it is still the same coordinator.
- Existing school registered pathways were **not inferred or changed** from teacher nominations.

## School directory additions

Two real schools appeared in the teacher CSV but were not in the previous school directory and are now added:

- `6026` - Al Bayan School - Charter - Abu Dhabi
- `9255` - Maplewood Canadian International School - Private - Abu Dhabi

Their teacher/coordinator records come from the attached CSV. Because no Arabic school name was supplied for these two schools, the Arabic UI safely falls back to the English school name rather than inventing a translation.

The manually requested school is also added:

- `9105` - Emirates National Schools - Mbz
- Arabic: `مدرسة الإمارات الوطنية - محمد بن زايد`
- Region: Abu Dhabi
- School type: Private, matching the existing Emirates National Schools campuses in the school master
- No teacher records
- No registered pathways
- No coordinator on file

It can search/select its school and then add pathways, coordinator details and teachers through the normal workflow.

## Source rows intentionally ignored

Two source rows were not imported:

- one person row with no school eSIS/name/region/type, because there is no school identity to attach it to;
- the explicit `Test School` / `Test` record.

See `data/teacher-data-update-report.json` for exact counts and the source SHA-256.

## Counts after the update

- Searchable schools after the teacher-data refresh: **290**
- Private teacher/coordinator roster records: **1,093**
- Verified coordinators preserved: **59**
- School names with supplied Arabic after the teacher-data refresh: **288**
- Schools using English fallback in Arabic: `6026`, `9255`

## Deployment impact

No Supabase migration is required. Existing submitted-school locks and historical submissions are untouched. No Jotform question needs to be added or changed.

This is a code/data deployment only. Pull the latest GitHub `main` first, apply the changed files, run `npm test`, then push to GitHub so Vercel deploys the new roster.

## Later manual school addition - 2 October 2026

The registration directory now also includes:

- `500AD` - Um Kolthoom Girls School
- Arabic: `مدرسة أم كلثوم بنات`
- Region: Al Ain
- School type: Public / `حكومية`
- No teacher records on file
- No registered pathways on file
- No coordinator on file

It can select the school and add pathways, coordinator details and teachers through the normal workflow.
The current searchable directory is **291 schools**, including **289** with supplied Arabic school names.
The private teacher/coordinator roster remains **1,093 records**.
