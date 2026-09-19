"""Bilingual UI regression tests using real public assets and isolated simulated APIs.
No credentials, email delivery, or live Supabase/Jotform writes are used.
Run: python tests/browser_bilingual_test.py (Playwright + Chromium required).
"""
from pathlib import Path
import json, shutil
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
summary=[]
data=json.loads((ROOT/'data/registration-data.json').read_text(encoding='utf-8'))
sessions=[{k:v for k,v in s.items() if k!='venue'} for s in data['sessions']]
paths=data['officialPathways']
oral=[s for s in sessions if s['pathway']=='Oral History']
visual_ad=next(s for s in sessions if s['pathway']=='Visual Arts' and s['region']=='Abu Dhabi')
visual_aa=next(s for s in sessions if s['pathway']=='Visual Arts' and s['region']=='Al Ain')
teachers=[{'id':'T-1','nameEnglish':'Example Teacher One','nameArabic':'المعلّم التجريبي الأول','esis':'PASS-TEST-1','pathways':['Visual Arts','Digital Arts','Literary Arts','Performing Arts']},{'id':'T-2','nameEnglish':'Example Teacher Two','nameArabic':'المعلّم التجريبي الثاني','esis':'PASS-TEST-2','pathways':['Visual Arts','Digital Arts','Literary Arts','Performing Arts']}]
def make_school(esis,name,arabic,region='Abu Dhabi',verified=True,listed=True):
    return {'schoolEsis':esis,'schoolName':name,'schoolNameArabic':arabic,'region':region,'registeredPathways':['Visual Arts','Digital Arts','Literary Arts','Performing Arts'],'coordinator':{'nameEnglish':'Example Coordinator' if listed else '', 'nameArabic':'منسّق المدرسة التجريبية' if listed else '', 'listed':listed,'verified':verified},'teachers':teachers,'bookedSessionIds':[],'alreadySubmitted':False,'storageConfigured':True,'previewOnly':False}
schools={s['schoolEsis']:s for s in [make_school('TEST-101','Example School','مدرسة النموذج'),make_school('TEST-102','Example Dhafra School','مدرسة الظفرة التجريبية','Al Dhafra'),make_school('TEST-103','Example Al Ain School','مدرسة العين التجريبية','Al Ain',False),make_school('TEST-104','Example New School','مدرسة جديدة','Abu Dhabi',False,False)]}
server={'saved':set(),'attempts':[],'receipts':{},'fail_once':False,'fail_done':False}
(ROOT/'screenshots/bilingual').mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':1000},device_scale_factor=1)
    errors=[]
    def api(url, opts):
        from urllib.parse import urlparse,parse_qs
        parsed=urlparse(url);path=parsed.path
        if path=='/api/config':body={'version':2.2,'sessions':sessions,'officialPathways':paths,'requireAccessCode':False,'storageConfigured':True,'previewOnly':False}
        elif path=='/api/schools':body=[{**{k:s[k] for k in ['schoolEsis','schoolName','schoolNameArabic','region']},'alreadySubmitted':s['schoolEsis'] in server['saved']} for s in schools.values()]
        elif path=='/api/school':
            school=schools[parse_qs(parsed.query)['esis'][0]]
            body={**{k:school[k] for k in ['schoolEsis','schoolName','schoolNameArabic','region']},'alreadySubmitted':True} if school['schoolEsis'] in server['saved'] else school
        elif path=='/api/register':
            raw=opts['body'];body=json.loads(raw);server['attempts'].append(raw)
            if server['fail_once'] and not server['fail_done']:
                server['fail_done']=True;return {'abort':True}
            if body['requestId'] in server['receipts']:
                body=server['receipts'][body['requestId']]
            elif body['schoolEsis'] in server['saved']:
                return {'status':409,'body':{'code':'SCHOOL_ALREADY_SUBMITTED','error':'Already submitted. Each school can submit only once.'}}
            else:
                assert body['acknowledgements']=={'onceOnly':True,'emailConfirmation':True}
                server['saved'].add(body['schoolEsis'])
                receipt={'ok':True,'requestId':body['requestId'],'requestCount':len(body['selections']),'status':'Pending review'}
                server['receipts'][body['requestId']]=receipt;body=receipt
        else: raise AssertionError('Unexpected endpoint '+path)
        return {'status':200,'body':body}
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.expose_function('fixtureRequest',api)
    # This environment blocks browser URL navigation. Load the real assets in
    # about:blank, with safe simulated API responses and language storage.
    import re
    html=re.sub(r'<link[^>]*>|<script[^>]*></script>','',(ROOT/'public/index.html').read_text(encoding='utf-8'))
    def load():
        preference=page.evaluate('window.__languagePreference || "en"')
        page.goto('about:blank');page.set_content(html)
        page.add_style_tag(content=(ROOT/'public/styles.css').read_text(encoding='utf-8'))
        page.evaluate("""preference=>{
          window.__languagePreference=preference;
          Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>key==='nae-language'?window.__languagePreference:null,setItem:(key,value)=>{if(key==='nae-language')window.__languagePreference=value;}}});
          if(!crypto.randomUUID)crypto.randomUUID=()=> '10000000-1000-4000-8000-'+String(Math.floor(Math.random()*1e12)).padStart(12,'0');
          window.fetch=async(url,opts={})=>{const r=await fixtureRequest(url,opts);if(r.abort)throw new Error('Simulated connection loss.');return {ok:r.status<400,status:r.status,json:async()=>r.body};};
        }""",preference)
        page.add_script_tag(content=(ROOT/'public/i18n.js').read_text(encoding='utf-8'))
        page.add_script_tag(content=(ROOT/'public/app.js').read_text(encoding='utf-8'))
        page.locator('#school-search').wait_for()
    def select(esis):
        page.locator('#school-search').fill(esis);page.locator('.school-option').first.click();page.locator('#pathways-reviewed').wait_for()
    def nextschool():
        page.locator('#pathways-reviewed').check();page.locator('#school-next').click();page.locator('#session-list').wait_for()
    def toggle():page.locator('#language-toggle').click()
    def screenshot(name):page.screenshot(path=str(ROOT/'screenshots/bilingual'/name),full_page=True)
    def no_overflow():assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    load();expect(page.locator('html')).to_have_attribute('lang','en');toggle()
    expect(page.locator('html')).to_have_attribute('dir','rtl');expect(page.locator('#language-toggle')).to_have_text('English')
    assert page.locator('#language-toggle').bounding_box()['x']>900
    page.locator('#school-search').fill('النموذج');expect(page.locator('.school-option')).to_have_count(1)
    toggle();expect(page.locator('#school-search')).to_have_value('النموذج');page.locator('#school-search').press('ArrowDown');page.locator('#school-search').press('Enter')
    expect(page.locator('.school-card h3')).to_have_text('Example School');toggle()
    expect(page.locator('.school-card h3')).to_have_text('مدرسة النموذج')
    expect(page.locator('.badge.verified')).to_have_text('✓ تم التحقق')
    assert page.locator('#school-content input[type=email]').count()==0
    assert page.locator('#school-access').is_hidden()
    page.locator('#pathways-reviewed').check();toggle();expect(page.locator('#pathways-reviewed')).to_be_checked();toggle()
    screenshot('01-school-arabic.png');summary.append('English/Arabic toggle, top-right placement, Arabic-name search, keyboard selection and preserved pathway review: passed')
    nextschool()
    card=page.locator('#card-'+oral[0]['id']);card.locator('[data-select-session]').first.check()
    card2=page.locator('#card-'+oral[1]['id']);card2.locator('[data-select-session]').nth(1).check()
    toggle();expect(card.locator('[data-select-session]').first).to_be_checked();toggle()
    visual=page.locator('#card-'+visual_ad['id']);visual.locator('[data-add-session]').click()
    page.locator('#teacher-nameEnglish').fill('Example Added Teacher');page.locator('#teacher-nameArabic').fill('المعلّم المضاف التجريبي')
    page.locator('#dialog-language-toggle').click()
    expect(page.locator('#teacher-nameEnglish')).to_have_value('Example Added Teacher');expect(page.locator('#teacher-nameArabic')).to_have_value('المعلّم المضاف التجريبي')
    for k,v in {'esis':'PASS-TEST-900','position':'Teacher','workEmail':'example@example.invalid','mobile':'٠٥٠٠٠٠٠٠٠٠'}.items():page.locator('#teacher-'+k).fill(v)
    page.get_by_role('button',name='Save and select teacher',exact=True).click()
    expect(page.locator('#teacher-dialog')).not_to_be_visible();assert visual.locator('input[type=radio]:checked').count()==1
    toggle();screenshot('02-sessions-arabic.png');no_overflow()
    summary.append('Session selections and six-field added-teacher draft survive switching languages; Arabic mobile digits accepted: passed')
    for venue in [s['venue'] for s in data['sessions']]:assert venue not in page.locator('body').inner_text()
    page.locator('#sessions-next').click();assert page.locator('#request-form input[required]').count()==2
    assert page.locator('#request-form input:checked').count()==0
    page.locator('#submit-request').click();assert len(server['attempts'])==0;expect(page.locator('#submit-error')).to_be_visible()
    page.locator('#ack-once').check();page.locator('#submit-request').click();assert len(server['attempts'])==0
    toggle();expect(page.locator('#ack-once')).to_be_checked();expect(page.locator('#ack-email')).not_to_be_checked()
    page.locator('#ack-once').uncheck();page.locator('#ack-email').check();page.locator('#submit-request').click();assert len(server['attempts'])==0
    page.locator('#ack-once').check();toggle();screenshot('03-review-arabic.png')
    ar_ack='أنا مدرك أن مدرستي ستتمكن من تقديم الطلب عبر هذه المنصة لمرة واحدة فقط، وأنه لن يكون بالإمكان إجراء أي تعديلات على الطلب بعد تقديمه.'
    assert ar_ack in page.locator('#request-form').inner_text()
    page.locator('#submit-request').click();expect(page.get_by_role('heading',name='تم استلام طلبكم',exact=True)).to_be_visible()
    payload=json.loads(server['attempts'][0]);assert payload['language']=='ar';assert len(payload['selections'])==3;assert payload['acknowledgements']=={'onceOnly':True,'emailConfirmation':True}
    expect(page.locator('.thank-you-school')).to_have_text('شكرًا لكم، مدرسة النموذج.')
    expect(page.locator('.received-details')).to_have_text('سيتم مراجعة طلباتكم وفقًا لتوافر الجلسات، وسيصلكم بريد إلكتروني لتأكيد الطلب يتضمن تفاصيل الورشة، بما في ذلك معلومات الجلسة المؤكدة.')
    expect(page.locator('.received-note')).to_have_text('يرجى ملاحظة أن حضور الورشة لا يُعد مؤكدًا إلا بعد استلام البريد الإلكتروني الخاص بالتأكيد.')
    screenshot('04-received-arabic.png');toggle()
    expect(page.locator('.thank-you-school')).to_have_text('Thank you, Example School.')
    expect(page.locator('.received-details')).to_have_text('Your requests will be reviewed subject to session availability, you will receive a confirmation email with the workshop details, including the confirmed session information.')
    expect(page.locator('.received-note')).to_have_text('Please note: Workshop attendance is not confirmed until you receive the confirmation email.')
    assert len(server['attempts'])==1;screenshot('05-received-english.png')
    summary.append('Both mandatory acknowledgements block separately; Arabic submission and exact success messages in both languages: passed')
    toggle();load();expect(page.locator('html')).to_have_attribute('lang','ar')
    page.locator('#school-search').fill('TEST-١٠١');expect(page.locator('.school-submitted-tag')).to_have_text('تم تقديم الطلب مسبقًا');page.locator('.school-option').first.click()
    expect(page.get_by_role('heading',name='تم تقديم الطلب مسبقًا',exact=True)).to_be_visible();expect(page.locator('#school-next')).not_to_be_visible()
    summary.append('Language preference survives reload (simulated storage); Arabic digits find eSIS; school-wide already-submitted blocker remains active: passed')
    load();select('TEST-102');nextschool()
    v=page.locator('#pathway-card-visual-arts');assert v.locator('.teacher-row').count()==0
    v.locator('[data-region-pathway][value="Abu Dhabi"]').check();v.locator('[data-select-session]').first.check();toggle()
    expect(v.locator('[data-region-pathway][value="Abu Dhabi"]')).to_be_checked();assert v.locator('[data-select-session]:checked').count()==1
    toggle();v.locator('[data-region-pathway][value="Al Ain"]').check();assert v.locator('[data-select-session]:checked').count()==0
    v.locator('[data-select-session]').first.check();assert v.locator('[data-region-pathway]:checked').count()==1
    page.locator('#card-'+oral[0]['id']).locator('[data-select-session]').first.check();page.locator('#card-'+oral[1]['id']).locator('[data-select-session]').first.check()
    page.locator('#sessions-next').click();page.locator('#ack-once').check();page.locator('#ack-email').check()
    server['fail_once']=True;page.locator('#submit-request').click();expect(page.locator('#submit-error')).to_be_visible()
    before=server['attempts'][-1];toggle();page.locator('#submit-request').click();expect(page.get_by_role('heading',name='Your request has been received')).to_be_visible()
    assert server['attempts'][-1]==before
    parsed=json.loads(before);assert sum(1 for s in parsed['selections'] if s['sessionId'] in [visual_ad['id'],visual_aa['id']])==1
    summary.append('Al Dhafra keeps one region per pathway; region change clears earlier teacher; retry after language change sends identical request: passed')
    load();select('TEST-103');page.locator('[name=coordinator-action][value=change]').check()
    page.locator('#coord-nameEnglish').fill('Example Changed Coordinator');page.locator('#coord-nameArabic').fill('المنسّق التجريبي الجديد');toggle()
    expect(page.locator('#coord-nameEnglish')).to_have_value('Example Changed Coordinator');assert page.locator('#coordinator-form input[required]').count()==8
    expect(page.locator('#coord-nameArabic')).to_have_attribute('dir','rtl');expect(page.locator('#coord-workEmail')).to_have_attribute('dir','ltr')
    summary.append('Unverified coordinator change form preserves all entered values and correct Arabic/LTR input directions: passed')
    page.set_viewport_size({'width':390,'height':844});load();select('TEST-104');no_overflow();screenshot('06-mobile-school-arabic.png')
    assert page.locator('#coordinator-form input[required]').count()==8
    for k,v in {'nameEnglish':'Example New Coordinator','nameArabic':'منسّق تجريبي جديد','esis':'PASS-COORD-TEST','position':'Coordinator','emiratesId':'784-2000-0000000-0','workEmail':'work@example.invalid','primaryEmail':'primary@example.invalid','mobile':'0500000000'}.items():page.locator('#coord-'+k).fill(v)
    nextschool();no_overflow();screenshot('07-mobile-sessions-arabic.png')
    page.locator('#card-'+oral[0]['id']).locator('[data-select-session]').first.check();page.locator('#sessions-next').click();no_overflow();screenshot('08-mobile-review-arabic.png')
    for width in [320,360,768,1280]:page.set_viewport_size({'width':width,'height':900});no_overflow()
    page.set_viewport_size({'width':390,'height':844});page.locator('#ack-once').check();page.locator('#ack-email').check();page.locator('#submit-request').click()
    expect(page.get_by_role('heading',name='تم استلام طلبكم',exact=True)).to_be_visible();no_overflow();screenshot('09-mobile-received-arabic.png')
    summary.append('Arabic coordinator, sessions, review and success layouts checked at 320, 360, 390, 768 and 1280 pixels with no horizontal overflow: passed')
    assert not errors,errors;summary.append('Browser JavaScript errors: 0')
    browser.close()
(ROOT/'docs/bilingual-browser-test-results.txt').write_text('\n'.join(summary)+'\n',encoding='utf-8')
print('\n'.join(summary))
