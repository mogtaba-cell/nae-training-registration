# Deploy the request-workflow update from VS Code

**Use the whole new project. This release requires a one-time database setup before it can accept requests. Your Jotform form ID remains unchanged.**

**Already on v2?** Follow `UPGRADE-ONCE.md` and run `database/migrations/003_one_request_per_school.sql` in your existing database before redeploying. Do not create a new empty database that would lose the submitted-school history.

## 1. Use a clean project folder

Extract this ZIP into a new folder. Copy only your existing `.vercel` folder and `.env.local` file from the old project into the new root. Keep those private; they are not included in this package.

Open this new folder in VS Code. It must contain `api`, `lib`, `data`, `public`, `database`, `package.json`, and `vercel.json`. Do not open or deploy only `public`.

The old `api/_lib.js` file is no longer used. A clean folder avoids retaining obsolete API files.

## 2. Create the request database

Create a Supabase project in your organization's approved account and hosting region. Do not put teacher/contact data into a publicly readable table.

In the Supabase dashboard, open **SQL Editor**, create a query, paste the entire contents of `database/setup.sql`, and run it. This creates the protected request tables and transaction functions.

Next, run `database/smoke-test.sql` in the SQL Editor. It uses synthetic data and rolls everything back. The expected result is a PASS notice for uniqueness, atomic rollback and idempotent retries. Resolve any error before continuing.

The database is needed for the school's one-time form submission and per-session teacher limit across browsers and devices. Jotform itself remains the review/reporting interface.

## 3. Add server-only environment variables

Keep the existing values:

```text
JOTFORM_FORM_ID=262592775577071
JOTFORM_API_KEY=your existing private key
```

Add these three values to `.env.local` and to **Vercel project > Settings > Environment Variables**:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | The project's Supabase URL, for example `https://your-project.supabase.co` |
| `SUPABASE_SECRET_KEY` | A server-side secret API key (`sb_secret_...`) from that Supabase project; not a publishable/public key |
| `CRON_SECRET` | A newly generated random secret protecting the synchronization endpoint |

Generate a secret locally in the VS Code terminal:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep the output private. Use it as `CRON_SECRET`.

Add values through the dashboard or the CLI prompts:

```powershell
npx vercel@latest env add SUPABASE_URL
npx vercel@latest env add SUPABASE_SECRET_KEY
npx vercel@latest env add CRON_SECRET
```

Choose the appropriate Production, Preview and Development scopes. **Prefer a separate test database and Jotform form for Preview/Development. If all environments use the same production credentials, a test is a real request and uses that school's one-time form submission.**

The default Jotform API host is `https://api.jotform.com`. For an account hosted in the EU or HIPAA environment, set `JOTFORM_API_BASE` to the official corresponding API host.

Do not prefix these keys with `NEXT_PUBLIC_`, put them in `public/`, or paste them into chat.

## 4. Enable school access codes before public release

Generate another random secret, separate from `CRON_SECRET`, and set it as `SCHOOL_ACCESS_SECRET` in `.env.local` and Vercel. Then run locally:

```powershell
node --env-file=.env.local scripts/access-codes.js
```

This creates `data/access-codes.csv`. Send only the appropriate code to each school's authorized contact. The file is excluded from Git and deployment. Do not send the complete code list to schools.

Once this variable is set, the UI asks for the school's code before opening an unsubmitted school's roster, and the backend requires the code for roster reads and submissions. Basic school identity and the Already submitted flag remain publicly visible; returning-school responses include no roster or coordinator. The dropdown still searches by school name/eSIS. Changing the secret invalidates old codes; regenerate/distribute them as needed.

Without access codes or equivalent external school authentication, the public search is not an identity check.

## 5. Check integrations without creating a submission

In the project terminal:

```powershell
node --version
npm test
npm run check:integration
```

Node should be version 22. The integration check is read-only. It verifies that the database is reachable and that all required Jotform fields are present.

If it reports missing Jotform labels, resolve that mapping before launch. The package deliberately uses exact question labels to avoid posting new fields into unrelated questions.

## 6. Handle existing genuine registrations

The source workbook supplies schools and teachers, not existing submitted requests. Jotform-only submissions do not automatically mark a school as submitted in the database. Existing v2 database requests, however, are picked up by the v2.1 lock migration automatically.

Review old TEST records and genuine records separately. Do not delete real records just to pass a test. The supplied import script reads Jotform and reports unmatched data or duplicate school/session entries:

```powershell
node --env-file=.env.local scripts/import-existing-jotform.js
```

This first command is **read-only**. If it finds duplicate requests or cannot match a school/session/date, it stops without importing. Resolve the report before launch.

When the report is correct, pause the sync cron during the import, then import the existing genuine records:

```powershell
node --env-file=.env.local scripts/import-existing-jotform.js --import
```

This groups all legacy session records for each school into one school request and locks that school against further submissions. Re-enable the sync cron after the import has finished. It does not edit or delete the original Jotform submissions, send emails, or automatically approve attendance. The legacy-import step is unnecessary when there are no genuine Jotform-only records. The v2.1 schema migration is still required for an existing v2 database.

## 7. Preview the application

For local interface testing, set `LOCAL_PREVIEW_ONLY=true` in `.env.local`, then:

```powershell
npm run dev
```

Open `http://localhost:3000`. This mode does not submit anything. Set `LOCAL_PREVIEW_ONLY=false` for a real end-to-end test against a dedicated test database/form.

Create a Vercel preview:

```powershell
npx vercel@latest
```

Use the existing Vercel project. Framework is **Other** and output directory is **public** (the included configuration sets these). The server functions in `api/` are still deployed alongside those public assets.

Test a verified coordinator, an unverified coordinator, a missing coordinator, a school without teachers, both Oral History dates, an Al Ain school and an Al Dhafra school. For Al Dhafra, verify that Literary Arts, Digital Arts and Visual Arts each require a single Abu Dhabi-or-Al Ain choice and never allow both regional sessions for the same pathway. Check that choosing a second name replaces the first for the same session. Review the printable request summary.

For the end-to-end write test, use a test environment. Verify the records in both Supabase and Jotform, then reload or use a second browser and select the same school. It must display Already submitted. With two tabs opened before the first submission, try another request for entirely different sessions: it must also be rejected without writing any part of the second batch. This is the required live verification that has not been performed in this chat.

## 8. Deploy production

After the setup and tests:

```powershell
npx vercel@latest --prod
```

Open the production URL and verify the new three-step workflow and school access-code gate. Confirm that no old attendance-confirmation notification is configured to run from Jotform. The app records Pending review and does not send selection emails.

## 9. Monitor requests and Jotform synchronization

The normal path saves a request in the database and mirrors each selected session into Jotform immediately. In Supabase, the private `nae_sync_monitor` view shows pending/synced/needs_review records without contact/identity fields.

The included Vercel cron runs daily and retries pending mirror records. It requires `CRON_SECRET`. Requests remain safely stored if Jotform is temporarily unavailable. An interrupted or ambiguous POST is not automatically reposted, to avoid duplicate Jotform records.

To reconcile ambiguous writes locally:

```powershell
node --env-file=.env.local scripts/reconcile-sync.js
```

It reads Jotform and marks exactly matched records as synced. It does not post new submissions. Records with zero or multiple matches remain held for administrator review. Do not reset them to pending until you have checked the corresponding Portal Registration ID in Jotform.

To trigger a protected sync manually after fixing a mapping/key issue, use a terminal where `.env.local` is loaded or an HTTP client with `Authorization: Bearer YOUR_CRON_SECRET` to `POST /api/sync`. Never put that secret in a public URL.

Review requests in Jotform and send selection emails through your approved process. Changing Jotform's Request Status alone does not reopen a school's form or change the database's review state. Any change of teacher after submission should be handled administratively with the records kept consistent.
