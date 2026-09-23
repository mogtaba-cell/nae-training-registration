# Session language update

The active 2026 workshop sessions now show their delivery language in the bilingual registration interface and review/receipt summary.

- Literary Arts — 28 Sep, Abu Dhabi: Arabic Only
- Digital Arts — 29 Sep, Abu Dhabi: Bilingual
- Digital Arts — 1 Oct, Al Ain: Bilingual
- Oral History — 1 Oct, Abu Dhabi: Arabic Only
- Performing Arts - Drama — 2 Oct, Abu Dhabi: Arabic Only
- Literary Arts — 5 Oct, Al Ain: Arabic Only
- Visual Arts — 6 Oct, Abu Dhabi: Bilingual
- Visual Arts — 8 Oct, Al Ain: Bilingual

The closed Oral History session on 24 Sep remains hidden from new registration and was intentionally excluded from the active-language update.

Arabic UI labels:
- Language: لغة الجلسة
- Arabic Only: العربية فقط
- Bilingual: ثنائية اللغة

The session language is also stored in the Supabase request payload for new submissions and mirrored into the Jotform Notes field. No database migration or new Jotform question is required.
