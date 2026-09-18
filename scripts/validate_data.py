import json
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'data'/'registration-data.json'
d=json.loads(p.read_text(encoding='utf-8'))
assert len(d['schools'])==286
assert len({s['schoolEsis'] for s in d['schools']})==286
assert len(d['sessions'])==9
assert {s['pathway'] for s in d['sessions']}=={'Oral History','Literary Arts','Digital Arts','Performing Arts','Visual Arts'}
assert all(s['region']=='Abu Dhabi' for s in d['sessions'] if s['pathway'] in {'Oral History','Performing Arts'})
assert len([s for s in d['sessions'] if s['pathway']=='Oral History'])==2
assert sum(bool(s['teachers']) for s in d['schools'])==220
assert sum(not s['teachers'] for s in d['schools'])==66
assert sum(len(s['teachers']) for s in d['schools'])==823
assert sum(bool(s.get('schoolCoordinator') and s['schoolCoordinator'].get('name') and s['schoolCoordinator'].get('email')) for s in d['schools'])==278
assert sum(not (s.get('schoolCoordinator') and s['schoolCoordinator'].get('name') and s['schoolCoordinator'].get('email')) for s in d['schools'])==8
for school in d['schools']:
    for teacher in school['teachers']:
        assert 'Applied Arts' not in teacher['nominatedTrainingPathways']
khalifa=[s for s in d['schools'] if s['schoolEsis']=='1079AD'][0]
assert khalifa['schoolCoordinator']['name']=='Hind Salem'
assert khalifa['schoolCoordinator']['phone']=='0503249291'
print('Validation passed:',len(d['schools']),'schools,',sum(bool(s['teachers']) for s in d['schools']),'with nominations,',sum(not s['teachers'] for s in d['schools']),'without nominations,',d['schoolListSummary']['schoolsWithCoordinator'],'with coordinators,',d['schoolListSummary']['schoolsWithoutCoordinator'],'without coordinators')
