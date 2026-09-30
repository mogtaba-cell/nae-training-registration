# Closed sessions — 1 and 2 October 2026

Registration is now closed for every session taking place on 1 or 2 October 2026:

- Digital Arts — Al Ain — 1 October 2026 — 9:00 AM–3:00 PM
- Oral History — Abu Dhabi — 1 October 2026 — 10:00 AM–1:00 PM
- Performing Arts - Drama — Abu Dhabi — 2 October 2026 — 9:00 AM–12:00 PM

These sessions remain in `data/registration-data.json` for historical records, but each now has `registrationOpen: false`.

The existing generic closed-session safeguards remain in place:

- `api/config.js` omits closed sessions from the browser configuration.
- `lib/domain.js` excludes closed sessions from eligible sessions, so stale tabs or manually altered requests cannot submit them.
- Existing Supabase and Jotform records are not changed.

Previously closed sessions on 24, 28 and 29 September remain closed.
