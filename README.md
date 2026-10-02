# NAE training registration requests - bilingual v2.2.4

English / Arabic school workshop registration portal for Vercel, with Supabase
persistence and Jotform reporting. Requests are reviewed before attendance is
confirmed. No automatic acceptance emails are sent by this package.

**Updating the existing project? Read `TEACHER-DATA-UPDATE.md` first.**
This release needs no new Supabase migration and no new Jotform questions.
The latest private roster comes from the supplied teacher/coordinator CSV.

## Current workflow

1. School details: instant English/Arabic/eSIS search; review or add school pathways;
   display a verified coordinator only when marked verified in the source; confirm,
   change or add a coordinator where necessary.
2. Training registration: one teacher per chosen session. The same teacher may be
   reused across different sessions. The “Register another teacher for this session”
   action offers either a school-record teacher (including the coordinator) or a new
   teacher. A school-record person may be requested for a session even when their
   original nomination was under another pathway. Al Dhafra still chooses one region
   per regional pathway.
3. Review: two individually required acknowledgements, then one school-wide request.
4. Receipt: Pending review, exact supplied bilingual message and printable summary.

Changing the interface language does not change request identity or lose entries.
The two Oral History sessions are available to every school; each can have one
teacher. Performing Arts is Abu Dhabi only. Applied Arts remains an official school
pathway but has no separately invented workshop. No routing banner is displayed.

## Environment

Node.js 22.x. No application package dependencies need to be installed.
Keep all private keys server-side. See `.env.example` for the variable names.
School access codes are not used for this deployment: leave SCHOOL_ACCESS_SECRET
unset or empty. Removing that gate does not weaken the database's one-submission
restriction, but school search itself is not proof of school identity.

```powershell
npm test
npm run check:integration
npm run dev
```

`check:integration` is read-only and uses `.env.local`. Always use TEST services
for actual trial submissions. Testing against LIVE consumes a real school request.

Fresh database setup: `DEPLOYMENT.md` and `database/setup.sql`.
Old v2 to one-school-request upgrade only: `UPGRADE-ONCE.md`.
Existing current database: **no SQL changes are needed for this update.**

## Data and privacy

`data/registration-data.json` is a private server dataset, not a public asset.
Keep this repository private. Existing coordinator emails, phones and identity
numbers are not returned by school lookup. School directories include only names,
eSIS, region and submitted status. Most Arabic school names came from the supplied `schools (9).csv`. The 29 September
teacher-data refresh adds two teacher-list schools without supplied Arabic school names,
so Arabic safely falls back to English for those two. Schools `9105` and `500AD` use the Arabic names
provided manually with their additions. See `TEACHER-DATA-UPDATE.md`.

Only the language preference is saved in browser storage. Draft personal details
stay in page memory. English canonical pathway/session IDs continue to be used in
storage/Jotform so changing display language does not break routing.

Accepted acknowledgements, their exact selected-language text and policy version
are stored in the request JSON and mirrored to the existing Jotform Notes field.
Earlier records are not backfilled with consent they did not provide.

## Maintenance

After rebuilding the base school dataset, reapply Arabic school names and then refresh
the private teacher/coordinator roster:

```powershell
python scripts/import_arabic_schools.py data/school-names-bilingual.csv
python scripts/import_teacher_coordinator_csv.py "C:\path\to\allteachersschoolcoordinators.csv"
```

The roster importer preserves existing registered school pathways, refreshes the attached
teacher/person data, and retains the manually approved `9105` and `500AD` schools. No secret files,
Node modules or font files are distributed in this package.
