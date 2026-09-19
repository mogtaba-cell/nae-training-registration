"""Merge official Arabic school names by eSIS; never overwrite coordinator/teacher records.
Usage: python scripts/import_arabic_schools.py path/to/schools.csv
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'data/school-names-bilingual.csv'
path = ROOT / 'data/registration-data.json'
data = json.loads(path.read_text(encoding='utf-8'))
with source.open(encoding='utf-8-sig', newline='') as f:
    rows = list(csv.DictReader(f))
by_id = {}
for row in rows:
    key = row['eSIS_School'].strip().upper()
    if not key or key in by_id or not row['School Name Ar'].strip():
        raise ValueError('Missing/duplicate school ID or missing Arabic name: ' + key)
    if row['Region'].strip() not in ('Abu Dhabi', 'Al Ain', 'Al Dhafra'):
        raise ValueError('Unknown region for ' + key)
    by_id[key] = row
existing = {s['schoolEsis'].strip().upper(): s for s in data['schools']}
missing = sorted(set(existing) - set(by_id))
if missing:
    raise ValueError('Names file does not cover existing schools: ' + ', '.join(missing))
added = []
for key, row in by_id.items():
    if key not in existing:
        school = {'schoolEsis':row['eSIS_School'].strip(), 'schoolName':row['School Name'].strip(),
                  'schoolType':row['School Type'].strip(), 'region':row['Region'].strip(),
                  'registeredPathways':[], 'coordinator':{**{k:'' for k in ('nameEnglish','nameArabic','esis','position','emiratesId','workEmail','primaryEmail','mobile')},'verified':False},'teachers':[]}
        data['schools'].append(school)
        existing[key] = school
        added.append(key)
    existing[key]['schoolNameArabic'] = row['School Name Ar'].strip()
    existing[key]['schoolTypeArabic'] = row['School Type Ar'].strip()
    existing[key]['regionArabic'] = row['Region Ar'].strip()
data['schoolNamesSource'] = 'school-names-bilingual.csv (supplied as schools (9).csv)'
path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
report = {'source':'schools (9).csv','csvRecords':len(rows),'matchedExisting':len(existing)-len(added),
          'addedSchoolIds':added,'totalSchools':len(data['schools']),'unmatchedExisting':missing,
          'teacherRecordsUnchanged':sum(len(s['teachers']) for s in data['schools']),
          'note':'Arabic names matched by eSIS. Existing coordinators, teachers, pathways and routing are preserved. New schools start without a coordinator, pathways or nominees.'}
(ROOT/'data/bilingual-import-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
