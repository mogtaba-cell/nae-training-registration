"""Import the supplied workbook without exposing private contacts in public assets.
Usage: python scripts/import_workbook.py path/to/Schools49.xlsx
Requires openpyxl. Existing sessions are preserved unless --schedule is supplied.
"""
from pathlib import Path
from collections import defaultdict, Counter
import argparse, hashlib, json, re
import openpyxl
ROOT = Path(__file__).resolve().parents[1]
PATHWAYS = ['Literary Arts','Performing Arts','Visual Arts','Digital Arts','Applied Arts']
def text(v):
    if v is None: return ''
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return str(v).strip()
def phone(v):
    raw = text(v)
    digits = re.sub(r'\D','',raw)
    if len(digits)==9 and digits.startswith('5'): return '0'+digits
    return raw

def main():
    p=argparse.ArgumentParser(); p.add_argument('workbook'); p.add_argument('--schedule')
    args=p.parse_args(); wb=openpyxl.load_workbook(args.workbook,read_only=True,data_only=True)
    schools={}; notices=[]; rowcount=0
    for i,r in enumerate(wb['Schools Coordinators'].values):
        if i==0: headers=r; continue
        if not any(v is not None for v in r): continue
        row=dict(zip(headers,r)); esis=text(row['eSIS_School'])
        if esis in schools: raise ValueError('Duplicate school ID: '+esis)
        registered=[]
        for key in ['Competition Pathways','Participation Pathway 1','Participation Pathway 2','Participation Pathway 3']:
            for value in re.split(r'[,;]',text(row.get(key))):
                value=value.strip()
                if not value: continue
                if value not in PATHWAYS: raise ValueError('Unknown pathway: '+value)
                if value not in registered: registered.append(value)
        coord={'nameEnglish':text(row['Full Name']), 'nameArabic':'', 'esis':'', 'position':'', 'emiratesId':'',
               'workEmail':text(row['Email']), 'primaryEmail':'', 'mobile':phone(row['Phone']),
               'verified':text(row['Coordinator Verified']).lower()=='yes'}
        if coord['verified'] and not coord['nameEnglish']: raise ValueError('Verified coordinator missing name')
        schools[esis]={'schoolEsis':esis,'schoolName':text(row['School Name Eng']), 'schoolType':text(row['School Type']),
                       'region':text(row['Region']), 'registeredPathways':[p for p in PATHWAYS if p in registered],
                       'coordinator':coord,'teachers':[]}
    teacher_maps=defaultdict(dict)
    for i,r in enumerate(wb['Teachers data'].values):
        if i==0: headers=r; continue
        if not any(v is not None for v in r): continue
        rowcount+=1; row=dict(zip(headers,r)); schoolid=text(row['eSIS_School']); esis=text(row['Teacher eSIS'])
        if schoolid not in schools: raise ValueError('Teacher school missing from master: '+schoolid)
        pathway=text(row['Session Pathway'])
        if pathway not in PATHWAYS: raise ValueError('Unknown teacher pathway: '+pathway)
        # A missing identifier is NOT treated as a shared "None" identity.
        identity=esis.casefold() if esis else (text(row['Email']).casefold()+'|'+text(row['Teacher Name_Eng']).casefold())
        key=hashlib.sha256((schoolid+'|'+identity).encode()).hexdigest()[:20]
        group=teacher_maps[schoolid]
        if key not in group:
            group[key]={'id':'T-'+key,'esis':esis,'nameEnglish':text(row['Teacher Name_Eng']), 'nameArabic':'', 'position':'',
                        'workEmail':text(row['Email']), 'mobile':phone(row['Phone']),'pathways':[]}
        t=group[key]
        if text(row['Teacher Name_Eng'])!=t['nameEnglish']: raise ValueError('Conflicting names for a teacher identifier')
        if pathway not in t['pathways']: t['pathways'].append(pathway)
    missing=[]; nomination_only=[]
    for sid,s in schools.items():
        s['teachers']=sorted(teacher_maps[sid].values(),key=lambda t:t['nameEnglish'].casefold())
        for t in s['teachers']:
            t['pathways']=[p for p in PATHWAYS if p in t['pathways']]
            if not t['esis']: missing.append({'schoolEsis':sid,'teacherId':t['id'],'teacherName':t['nameEnglish']})
            for p in t['pathways']:
                if p not in s['registeredPathways']: nomination_only.append((sid,p))
    data_path=ROOT/'data/registration-data.json'
    sessions=json.loads(data_path.read_text())['sessions']
    if args.schedule:
        sw=openpyxl.load_workbook(args.schedule,read_only=True,data_only=True)
        sessions=[]
        for r in list(sw.active.values)[2:]:
            if not r[0]: continue
            pathway,date,region,venue,time=r
            date=date.strftime('%Y-%m-%d'); sid=re.sub('[^A-Z0-9]+','-',(pathway+'-'+region).upper())+'-'+date.replace('-','')
            sessions.append({'id':sid,'pathway':pathway,'date':date,'region':region,'venue':text(venue),'time':text(time)})
    for s in sessions:
        s['time']=re.sub(r'^(Abu Dhabi|Al Ain):\s*','',s['time'])
    sessions.sort(key=lambda s:(s['date'],s['pathway'],s['region']))
    payload={'schemaVersion':2,'sourceWorkbook':Path(args.workbook).name,'officialPathways':PATHWAYS,
             'schools':sorted(schools.values(),key=lambda s:s['schoolName'].casefold()),'sessions':sessions}
    data_path.write_text(json.dumps(payload,ensure_ascii=False,indent=2))
    report={'source':Path(args.workbook).name,'schools':len(schools),'sourceTeacherPathwayRows':rowcount,
            'consolidatedSchoolTeacherRecords':sum(len(s['teachers']) for s in schools.values()),
            'coordinatorsVerifiedOnFile':sum(s['coordinator']['verified'] for s in schools.values()),
            'listedCoordinatorsAwaitingConfirmation':sum(bool(s['coordinator']['nameEnglish']) and not s['coordinator']['verified'] for s in schools.values()),
            'schoolsWithoutCoordinator':sum(not s['coordinator']['nameEnglish'] for s in schools.values()),
            'schoolsWithoutTeachers':sum(not s['teachers'] for s in schools.values()),
            'schoolsWithoutRegisteredPathways':sum(not s['registeredPathways'] for s in schools.values()),
            'missingTeacherIdsRequiringEntryOnSelection':missing,
            'teacherPathwaysNotInSchoolRegisteredList':len(set(nomination_only)),
            'note':'School pathways come ONLY from the coordinator sheet. A teacher nomination does not silently register the school in a new pathway. Blank formatting rows are ignored. Missing teacher IDs are requested when selecting that teacher.'}
    (ROOT/'data/import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if not isinstance(v,list)},indent=2))
if __name__=='__main__': main()
