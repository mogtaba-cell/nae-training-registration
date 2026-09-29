# 28 and 29 September sessions closed

The following sessions remain in the internal schedule data for historical compatibility but are closed to all new registration requests:

- `LITERARY-ARTS-ABU-DHABI-20260928` — Literary Arts, Abu Dhabi, 28 September 2026
- `DIGITAL-ARTS-ABU-DHABI-20260929` — Digital Arts, Abu Dhabi, 29 September 2026

The previously closed `ORAL-HISTORY-ABU-DHABI-20260924` remains closed as well.

Implementation:
- The closed sessions have `registrationOpen: false` in `data/registration-data.json`.
- `/api/config` excludes any session where `registrationOpen === false`, so they no longer appear in the registration UI in English or Arabic.
- Server-side request validation uses the same open-session filter, so stale browser tabs and manually modified requests cannot submit new registrations for them.
- Existing Supabase and Jotform records are not changed or deleted.

No Supabase migration or Jotform form edit is required.
