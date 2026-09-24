# Reuse school-record teachers across sessions

This update changes only application/UI validation. No Supabase migration and no
new Jotform questions are required.

## New behavior

When a user clicks **+ Register another teacher for this session**, the dialog now
offers two choices:

1. **Select a teacher from record** - shows all people already on the school's
   teacher record. The coordinator is included as a record person when necessary.
   The person's original pathway does not restrict which visible school session
   they can be requested for.
2. **Add a new teacher** - keeps the existing six required teacher fields.

The same teacher may be selected for multiple different sessions. The existing
rule remains: only one teacher may be selected for any one session.

A newly added teacher is automatically available as an inline choice on the other
session cards during the same school request, so their details do not need to be
entered again.

## Example covered by regression tests

For school eSIS **9163**, **Sehar Faisal Faisal Maqsood** (eSIS/PASS
**PASS145868**) can now be selected from the school record for the **Digital Arts**
session even though her source record is not nominated for Digital Arts.

## Privacy

Existing coordinator/teacher email addresses and mobile numbers remain server-side
and are not sent to the browser as part of the school record picker. The picker
uses the existing public name/eSIS record and the server resolves the full record
when the request is submitted.

## Deployment

Pull the latest GitHub project before copying these updated files. Then run:

```powershell
npm test
git add .
git commit -m "Allow school-record teachers across sessions"
git push origin main
```

No SQL migration is needed.
