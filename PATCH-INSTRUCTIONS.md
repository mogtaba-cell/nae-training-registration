# 1–2 October session closure patch

This patch closes all workshop registration sessions scheduled for 1 and 2 October 2026 while preserving all existing records.

Closed in this patch:
- DIGITAL-ARTS-AL-AIN-20261001
- ORAL-HISTORY-ABU-DHABI-20261001
- PERFORMING-ARTS-ABU-DHABI-20261002

Already closed and unchanged:
- ORAL-HISTORY-ABU-DHABI-20260924
- LITERARY-ARTS-ABU-DHABI-20260928
- DIGITAL-ARTS-ABU-DHABI-20260929

Still open:
- LITERARY-ARTS-AL-AIN-20261005
- VISUAL-ARTS-ABU-DHABI-20261006
- VISUAL-ARTS-AL-AIN-20261008

The runtime behavior is driven by `data/registration-data.json`. The existing `lib/domain.js` and `api/config.js` safeguards hide closed sessions and reject stale/manual submissions to them.

No database migration and no Jotform change are required.
