# Patch instructions - add school 500AD

This patch is intended to be applied on top of the latest GitHub `main` that already contains the 29 September teacher-data refresh and the 1-2 October session closures.

It adds `500AD` - Um Kolthoom Girls School / مدرسة أم كلثوم بنات as an Al Ain public school with no invented teachers, coordinator, or registered pathways. It also updates the teacher-roster importer so future roster refreshes retain this manually approved school.

After pulling `main`, copy the patch files into the repository root, replacing matching files, then run:

```powershell
npm test
git status
git diff
```

No Supabase migration and no Jotform form change are required.
