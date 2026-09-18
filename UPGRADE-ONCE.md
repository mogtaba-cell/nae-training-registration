# Update: one complete submission per school

This release is **v2.1**. It changes the rule from one teacher per school/session to **one complete form submission per school**, while keeping one teacher per session within that submission.

The code has been prepared and tested locally. It has not been installed in your Vercel or Supabase account. **Apply the database update before deploying these application files.**

## 1. Replace the application files

Extract the ZIP into a clean folder. Copy your existing `.vercel` folder and `.env.local` file into the new project root. Keep them private. Open the folder containing `package.json`, `api`, `lib`, `public`, and `database` in VS Code.

Your existing Jotform form and environment variables are unchanged. Do not deploy only the HTML or the `public` folder.

## 2. Apply the database change

### Already using the v2 Supabase database

In your existing Supabase project, open **SQL Editor > New query**. Copy the entire contents of:

```text
database/migrations/003_one_request_per_school.sql
```

Click **Run**. The script creates the school-wide lock, marks every school with a stored request as submitted, and updates the submission function. It does not delete, merge, or change any existing request or Jotform record. Older multiple submissions are retained as history; those schools cannot submit again.

The migration is safe to rerun. It briefly locks request-table writes while backfilling history so that concurrent submissions cannot slip through the upgrade.

### No Supabase database set up yet

Use the full instructions in `DEPLOYMENT.md`. Run `database/setup.sql` instead of the upgrade-only file. The new setup already includes the school-wide lock. Add the existing v2 database environment variables before attempting a real submission.

### Existing requests only in Jotform

The portal cannot see Jotform-only history automatically. First reconcile genuine submissions and test data. The updated `scripts/import-existing-jotform.js` groups legacy session records into **one school request per school** and marks those schools as submitted. Its default mode is read-only; `--import` writes to the database. See `DEPLOYMENT.md` section 6. Pause the sync cron while importing and re-enable it afterward.

Do not use this importer to reconstruct a lost v2 database. Restore the original database/backup for v2 requests; the importer deliberately skips `REQ-` records that already belong to the v2 workflow.

## 3. Check before going live

Run `database/smoke-test.sql` in the same Supabase SQL Editor. It uses synthetic school IDs and rolls back every test write. Expect a PASS notice covering first submission, identical retry, school-wide rejection, rollback, and one teacher per session. A successful completion may be shown simply as a successful query when notices are hidden.

From VS Code:

```powershell
npm test
npm run check:integration
npx vercel@latest
```

Use a separate test database and Jotform for Preview/Development. **A test against your production database consumes that school's real, one-time submission.** A preview using production credentials is not a safe sandbox.

In the test environment, submit one school request. Refresh the page or open a different browser and select that school again. It must show **Already submitted**, with no continuation or submission controls. A different school must still be able to submit.

For a concurrency test, open the same school in two browsers BEFORE either submits. Choose different sessions. Submit both. Exactly one school request should be accepted; the other should show Already submitted. Check the database for one school request and no session records from the rejected attempt.

After testing:

```powershell
npx vercel@latest --prod
```

## What schools will see

The search dropdown adds **Already submitted** beside schools on record. Selecting a school checks the database again, so an older dropdown result cannot authorize another submission.

A returning school sees:

> **Already submitted**
>
> A training registration request has already been submitted for this school. Each school can submit only once.
>
> Requests are subject to review. Selected teachers will be notified by email.
>
> For corrections, please contact the training team.

The portal does not return that school's coordinator, teacher roster, selections, or receipt ID on this screen. Before a first submission, the review page warns that all workshop requests must be included now.

## Reliability and boundaries

The primary database, not a browser cookie, holds the school lock. It applies across browsers, private windows, devices, fresh request IDs, and different selected sessions. Simultaneous inserts are guarded by a primary key and a transaction trigger.

A draft or failed validation does not use up the submission. A saved request does, even if its Jotform mirror is pending. A dropped response can be retried with the same request ID and unchanged details to retrieve the existing receipt; that retry does not create a second request.

Changing review status to Approved, Not selected, or Withdrawn does not reopen the form. There is no public unlock/resubmit control. Corrections need administrative handling with the original records kept consistent.

Keep school access codes enabled. A one-time lock prevents repeats; it does not by itself prove that a visitor represents the chosen school.

Distribute only the current portal URL. Retire any older direct-to-Jotform deployments. Direct/manual Jotform entries bypass this database and must be reconciled administratively; deleting a Jotform record does not clear the portal's school lock.

## Test evidence included

- `docs/unit-test-results.txt`: 56 passing local Node tests, including mocked API/storage cases.
- `docs/browser-test-results.txt`: existing registration journeys checked using simulated APIs.
- `docs/once-browser-test-results.txt`: returning-school, stale-tab, retry, double-click and mobile checks using simulated APIs.
- `database/smoke-test.sql`: database test for you to run before launch.

The PostgreSQL migration, simultaneous real database transactions, and live Supabase/Jotform path have not been executed against your connected deployment in this update.

## Official reference documentation

Supabase SQL Editor and database functions: https://supabase.com/docs/guides/database/functions

PostgreSQL unique-index enforcement: https://www.postgresql.org/docs/18/index-unique-checks.html

Vercel CLI deployment: https://vercel.com/docs/cli/deploy
