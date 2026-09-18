import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / 'data' / 'registration-data.json'
MASTER_CSV = ROOT / 'data' / 'schools-master.csv'


def norm_id(value):
    return str(value or '').strip().upper()


def norm_name(value):
    return ' '.join(str(value or '').strip().lower().split())


def normalize_phone(value):
    raw = str(value or '').strip()
    digits = re.sub(r'\D', '', raw)
    # The coordinator CSV stores UAE mobile numbers as 9 digits because the
    # leading zero was dropped when exported from a numeric spreadsheet cell.
    if len(digits) == 9 and digits.startswith('5'):
        return '0' + digits
    return raw


data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
with MASTER_CSV.open(encoding='utf-8-sig', newline='') as f:
    master_rows = list(csv.DictReader(f))

old_schools = data['schools']
by_id = {norm_id(s['schoolEsis']): s for s in old_schools}
by_name = {norm_name(s['schoolName']): s for s in old_schools}

new_schools = []
matched_old = set()
for row in master_rows:
    master_id = row['eSIS_School'].strip()
    master_name = row['School Name'].strip()
    matched = by_id.get(norm_id(master_id)) or by_name.get(norm_name(master_name))
    if matched:
        matched_old.add((matched['schoolEsis'], matched['schoolName']))

    coordinator_name = (row.get('Coordinator') or '').strip()
    coordinator_email = (row.get('Email') or '').strip()
    coordinator_phone = normalize_phone(row.get('School Coordinator Number'))
    coordinator = None
    if coordinator_name or coordinator_email or coordinator_phone:
        coordinator = {
            'name': coordinator_name,
            'email': coordinator_email,
            'phone': coordinator_phone,
        }

    new_schools.append({
        'schoolEsis': master_id,
        'schoolName': master_name,
        'schoolType': row['School Type'].strip(),
        'region': row['Region'].strip(),
        'schoolCoordinator': coordinator,
        'teachers': matched.get('teachers', []) if matched else [],
    })

unmatched = [s for s in old_schools if (s['schoolEsis'], s['schoolName']) not in matched_old]
if unmatched:
    raise RuntimeError('Schools from the existing portal data are missing from the new master list: ' + '; '.join(f"{s['schoolEsis']} - {s['schoolName']}" for s in unmatched))

sources = list(data.get('generatedFrom', []))
source_name = 'schools (44).csv'
if source_name not in sources:
    sources.append(source_name)
data['generatedFrom'] = sources
data['schools'] = new_schools
data['schoolListSummary'] = {
    'totalSchools': len(new_schools),
    'schoolsWithNominations': sum(bool(s['teachers']) for s in new_schools),
    'schoolsWithoutNominations': sum(not s['teachers'] for s in new_schools),
    'schoolsWithCoordinator': sum(bool(s.get('schoolCoordinator') and s['schoolCoordinator'].get('name') and s['schoolCoordinator'].get('email')) for s in new_schools),
    'schoolsWithoutCoordinator': sum(not (s.get('schoolCoordinator') and s['schoolCoordinator'].get('name') and s['schoolCoordinator'].get('email')) for s in new_schools),
}
DATA_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps(data['schoolListSummary']))
