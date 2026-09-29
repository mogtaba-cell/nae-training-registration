from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import shutil
import json
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'data/registration-data.json').read_text())
summary=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':1000},device_scale_factor=1)
    errors=[]
    page=context.new_page();page.on('pageerror',lambda error: errors.append(str(error)))
    # Browser network navigation is disabled in this environment. Render the actual
    # HTML/CSS/JS with safe API fixtures; no production service is contacted.
    import re
    safe_schools={}
    for school in data['schools']:
        safe_schools[school['schoolEsis']]={
            'schoolEsis':school['schoolEsis'],'schoolName':school['schoolName'],'schoolNameArabic':school.get('schoolNameArabic',''),'region':school['region'],
            'registeredPathways':school['registeredPathways'],
            'coordinator':{'nameEnglish':school['coordinator']['nameEnglish'],'listed':bool(school['coordinator']['nameEnglish']),'verified':school['coordinator']['verified']},
            'teachers':[{k:t[k] for k in ['id','nameEnglish','nameArabic','esis','pathways']} for t in school['teachers']],
            'bookedSessionIds':[],'storageConfigured':True,'previewOnly':False}
    fixture={'schools':safe_schools,'config':{'version':2,'sessions':[{k:v for k,v in x.items() if k!='venue'} for x in data['sessions'] if x.get('registrationOpen', True)],
        'officialPathways':data['officialPathways'],'requireAccessCode':False,'storageConfigured':True,'previewOnly':False}}
    html=(root/'public/index.html').read_text()
    html=re.sub(r'<link[^>]*>|<script[^>]*></script>','',html)
    def load():
        page.goto('about:blank');page.set_content(html)
        page.add_style_tag(content=(root/'public/styles.css').read_text())
        page.evaluate("""fixture => {
          if(!crypto.randomUUID) crypto.randomUUID=()=> '10000000-1000-4000-8000-' + String(Math.floor(Math.random()*1e12)).padStart(12,'0');
          window.__submitted=[];
          window.fetch=async (url, options={})=>{
            let value;
            if(url==='/api/config') value=fixture.config;
            else if(url==='/api/schools')value=Object.values(fixture.schools).map(s=>({schoolEsis:s.schoolEsis,schoolName:s.schoolName,schoolNameArabic:s.schoolNameArabic,region:s.region}));
            else if(url.startsWith('/api/school?'))value=fixture.schools[new URL(url,'https://test.invalid').searchParams.get('esis')];
            else if(url==='/api/register'){
              const b=JSON.parse(options.body);window.__submitted.push(b);
              value={ok:true,requestId:b.requestId,requestCount:b.selections.length,status:'Pending review',jotformSync:'synced'};
            }else throw new Error('Unexpected endpoint');
            return {ok:true,status:200,json:async()=>structuredClone(value)};
          };
        }""",fixture)
        page.add_script_tag(content=(root/'public/i18n.js').read_text())
        page.add_script_tag(content=(root/'public/app.js').read_text())
    def select(esis):
        load();page.locator('#school-search').fill(esis)
        page.locator('.school-option').first.click()
        page.locator('#pathways-reviewed').wait_for()
    select('6009')
    assert page.locator('.badge.verified').count()==1
    assert page.locator('#school-content input[type=email]').count()==0
    page.locator('[data-pathway="Performing Arts"]').check()
    page.locator('#pathways-reviewed').check()
    page.screenshot(path=str(root/'screenshots/01-school-details.png'),full_page=True)
    page.locator('#school-next').click()
    expect(page.locator('#session-list')).to_be_visible()
    assert page.locator('.session-card').count()==3
    assert page.locator('#session-list').get_by_text('Applied Arts',exact=True).count()==0
    assert page.locator('#card-LITERARY-ARTS-ABU-DHABI-20260928').count()==0
    assert page.locator('#card-DIGITAL-ARTS-ABU-DHABI-20260929').count()==0
    for venue in [s['venue'] for s in data['sessions']]:
        assert venue not in page.locator('body').inner_text()
    oral=page.locator('.session-card').filter(has=page.get_by_role('heading',name='Oral History',exact=True))
    first=oral.nth(0)
    first.locator('input[type=radio]').nth(0).check()
    first.locator('input[type=radio]').nth(1).check()
    assert first.locator('input[type=radio]:checked').count()==1
    t_id=first.locator('input[type=radio]:checked').get_attribute('value')
    performing=page.locator('.session-card').filter(has=page.get_by_role('heading',name='Performing Arts - Drama',exact=True))
    performing.locator('[data-add-session]').click();page.get_by_role('button',name='Select a teacher from record',exact=True).click();page.locator('[data-record-teacher]').first.click()
    assert page.locator('#selection-count').inner_text().startswith('2')
    page.screenshot(path=str(root/'screenshots/02-session-selection.png'),full_page=True)
    # Add new teacher inline and reuse that teacher for a second session.
    session=page.locator('.session-card').filter(has=page.get_by_role('heading',name='Visual Arts',exact=True))
    session.locator('[data-add-session]').click()
    expect(page.locator('#teacher-dialog')).to_be_visible()
    expect(page.get_by_role('button',name='Select a teacher from record',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Add a new teacher',exact=True)).to_be_visible()
    page.get_by_role('button',name='Add a new teacher',exact=True).click()
    assert page.locator('#teacher-form input[required]').count()==6
    values={'nameEnglish':'Test Workshop Teacher','nameArabic':'Test Arabic Name','esis':'PASS-UI-TEST','position':'Teacher','workEmail':'test@example.invalid','mobile':'0500000000'}
    for k,v in values.items():page.locator('#teacher-'+k).fill(v)
    page.get_by_role('button',name='Save and select teacher').click()
    expect(page.locator('#teacher-dialog')).not_to_be_visible()
    assert page.locator('#selection-count').inner_text().startswith('3')
    page.locator('#sessions-next').click()
    assert page.locator('.review-session').count()==3
    assert page.locator('body').get_by_text('test@example.invalid',exact=True).count()==0
    page.screenshot(path=str(root/'screenshots/03-review-request.png'),full_page=True)
    page.locator('#ack-once').check();page.locator('#ack-email').check();page.locator('#submit-request').click()
    expect(page.get_by_role('heading',name='Your request has been received')).to_be_visible()
    requests=page.evaluate('window.__submitted')
    assert len(requests)==1 and len(requests[0]['selections'])==3
    assert page.get_by_role('button',name='Register another school').count()==0
    assert page.get_by_text('Please note: Workshop attendance is not confirmed until you receive the confirmation email.',exact=True).count()==1
    page.screenshot(path=str(root/'screenshots/04-request-received.png'),full_page=True)
    summary.append('Desktop request journey with safe API fixtures and simulated submission: passed')
    # Unverified coordinator must not have the Verified badge.
    select('6005')
    assert page.locator('.badge.verified').count()==0
    page.locator('#pathways-reviewed').check();page.locator('#school-next').click()
    expect(page.locator('#school-error')).to_be_visible()
    page.locator('[name=coordinator-action][value=change]').check()
    assert page.locator('#coordinator-form input[required]').count()==8
    page.locator('[name=coordinator-action][value=confirm]').check();page.locator('#school-next').click()
    expect(page.locator('#session-list')).to_be_visible()
    summary.append('Unverified coordinator choices and required change fields: passed')
    # New coordinator and school without teacher nominations.
    school=next(s for s in data['schools'] if not s['coordinator']['nameEnglish'])
    select(school['schoolEsis'])
    assert page.locator('#coordinator-form input[required]').count()==8
    values={'nameEnglish':'Test Coordinator','nameArabic':'Test Arabic Coordinator','esis':'PASS-COORD-TEST','position':'Coordinator','emiratesId':'784-2000-0000000-0','workEmail':'work@example.invalid','primaryEmail':'primary@example.invalid','mobile':'0500000000'}
    for k,v in values.items():page.locator('#coord-'+k).fill(v)
    page.locator('#pathways-reviewed').check();page.locator('#school-next').click();expect(page.locator('#session-list')).to_be_visible()
    summary.append('Missing coordinator can add all eight fields and continue: passed')
    # No pathway and no roster remains able to request Oral History.
    school=next(s for s in data['schools'] if not s['teachers'] and not s['registeredPathways'] and s['coordinator']['nameEnglish'])
    select(school['schoolEsis'])
    page.locator('#pathways-reviewed').check()
    if not school['coordinator']['verified']:page.locator('[name=coordinator-action][value=confirm]').check()
    page.locator('#school-next').click()
    assert page.locator('.session-card').count()==1
    assert page.locator('.empty-session').count()==1
    summary.append('Empty school: open Oral History session and add-teacher control: passed')
    # Al Dhafra chooses one region per regional pathway; both regional session cards are never shown at once.
    school=next(s for s in data['schools'] if s['region']=='Al Dhafra' and s['coordinator']['nameEnglish'])
    select(school['schoolEsis'])
    for box in page.locator('[data-pathway]').all():box.check()
    page.locator('#pathways-reviewed').check()
    if not school['coordinator']['verified']:page.locator('[name=coordinator-action][value=confirm]').check()
    page.locator('#school-next').click()
    assert page.locator('.regional-pathway-card').count()==3
    assert page.locator('.session-card').count()==5  # 1 open Oral History + Performing + 3 regional pathway cards
    visual=page.locator('.regional-pathway-card').filter(has=page.get_by_role('heading',name='Visual Arts',exact=True))
    assert visual.locator('.region-option').count()==2
    assert visual.locator('.teacher-row').count()==0
    visual.locator('[data-region-pathway="Visual Arts"][value="Abu Dhabi"]').check()
    expect(visual.locator('.teacher-row').first).to_be_visible()
    assert 'Abu Dhabi' in visual.locator('.session-meta').inner_text()
    visual.locator('[data-region-pathway="Visual Arts"][value="Al Ain"]').check()
    assert 'Al Ain' in visual.locator('.session-meta').inner_text()
    assert visual.locator('[data-region-pathway="Visual Arts"]:checked').count()==1
    summary.append('Al Dhafra one-region-per-pathway flow: passed')
    # A teacher on the school record can be reused for a session outside their original pathway.
    select('9163')
    page.locator('#pathways-reviewed').check()
    if page.locator('[name=coordinator-action][value=confirm]').count():page.locator('[name=coordinator-action][value=confirm]').check()
    page.locator('#school-next').click();expect(page.locator('#session-list')).to_be_visible()
    digital=page.locator('.session-card').filter(has=page.get_by_role('heading',name='Digital Arts',exact=True))
    digital.locator('[data-add-session]').click();page.screenshot(path=str(root/'screenshots/teacher-options.png'),full_page=True);page.get_by_role('button',name='Select a teacher from record',exact=True).click();page.screenshot(path=str(root/'screenshots/teacher-record-list.png'),full_page=True)
    sehar=page.locator('[data-record-teacher]').filter(has_text='Sehar Faisal Faisal Maqsood')
    expect(sehar).to_have_count(1);sehar.click();expect(page.locator('#teacher-dialog')).not_to_be_visible()
    expect(digital.get_by_text('Sehar Faisal Faisal Maqsood',exact=True).first).to_be_visible()
    assert digital.locator('input[type=radio]:checked').count()==1
    summary.append('Existing school-record teacher can be reused across pathways through the two-option teacher flow: passed')
    # Mobile search, school view, and session layout.
    page.set_viewport_size({'width':390,'height':844});select('6009')
    page.locator('#pathways-reviewed').check();page.locator('#school-next').click()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    page.screenshot(path=str(root/'screenshots/05-mobile.png'),full_page=True)
    summary.append('Mobile 390px layout without horizontal overflow: passed')
    assert not errors,errors
    summary.append('Browser JavaScript errors: 0')
    browser.close()
(root/'docs/browser-test-results.txt').write_text('\n'.join(summary)+'\n')
print('\n'.join(summary))
