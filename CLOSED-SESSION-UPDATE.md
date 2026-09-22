# 24 September Oral History session closed

The session `ORAL-HISTORY-ABU-DHABI-20260924` remains in the internal schedule data for historical compatibility, but it is closed to all new requests.

Behavior after this update:
- The 24 September 2026 Oral History session is not returned by `/api/config`, so it is hidden from the registration UI in English and Arabic.
- Server-side request validation excludes the closed session. A stale browser tab or manually modified request cannot submit a new registration for it.
- Existing Supabase and Jotform records are not changed or deleted.
- The 1 October 2026 Oral History session remains open.
- No Supabase migration and no Jotform form edit are required.

Deploy by committing these application changes to the Git branch connected to Vercel.
