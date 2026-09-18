"""Browser behavior with synthetic schools and simulated APIs (no live writes)."""
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright, expect
import re
root=Path(__file__).resolve().parents[1]
html=re.sub(r'<link[^>]*>|<script[^>]*></script>','',(root/'public/index.html').read_text())
summary=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':960})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def load(submitted=False, failure=''):
        page.goto('about:blank');page.set_content(html)
        page.add_style_tag(content=(root/'public/styles.css').read_text())
        page.evaluate('''({submitted,failure})=>{
          if(!crypto.randomUUID) crypto.randomUUID=()=> '10000000-1000-4000-8000-' + String(Math.floor(Math.random()*1e12)).padStart(12,'0');
          window.__serverSubmitted=submitted;window.__fail=failure;window.__failed=false;window.__attempts=[];window.__commits=0;window.__accepted=null;
          const school={schoolEsis:'TEST-101',schoolName:'Example School',region:'Abu Dhabi',registeredPathways:['Visual Arts'],alreadySubmitted:false,
             coordinator:{nameEnglish:'Example Coordinator',verified:true,listed:true},
             teachers:[{id:'T-1',nameEnglish:'Example Teacher',nameArabic:'',esis:'PASS-TEST-1',pathways:['Visual Arts']}],bookedSessionIds:[]};
          const sessions=[{id:'OH-A',pathway:'Oral History',region:'Abu Dhabi',date:'2026-09-24',time:'9:30 AM - 3:00 PM'},
             {id:'OH-B',pathway:'Oral History',region:'Abu Dhabi',date:'2026-10-01',time:'9:30 AM - 3:00 PM'},
             {id:'VA-A',pathway:'Visual Arts',region:'Abu Dhabi',date:'2026-10-06',time:'9:30 AM - 3:00 PM'}];
          window.fetch=async(url,opts={})=>{
            let value,status=200;
            if(url==='/api/schools')value=[{schoolEsis:school.schoolEsis,schoolName:school.schoolName,region:school.region,alreadySubmitted:__serverSubmitted}];
            else if(url==='/api/config')value={version:2.1,sessions,officialPathways:['Visual Arts','Digital Arts','Applied Arts','Literary Arts','Performing Arts'],requireAccessCode:false,storageConfigured:true,previewOnly:false};
            else if(url.startsWith('/api/school?'))value=__serverSubmitted?{schoolEsis:school.schoolEsis,schoolName:school.schoolName,region:school.region,alreadySubmitted:true}:school;
            else if(url==='/api/register'){
              const raw=opts.body,b=JSON.parse(raw);__attempts.push(raw);
              if(__fail==='before-commit'&&!__failed){__failed=true;throw new Error('Simulated lost connection.');}
              if(__accepted===raw){value={ok:true,requestId:b.requestId,requestCount:b.selections.length,status:'Pending review'};}
              else if(__serverSubmitted){status=409;value={code:'SCHOOL_ALREADY_SUBMITTED',error:'Already submitted. Each school can submit only once.'};}
              else{__serverSubmitted=true;__commits++;__accepted=raw;
                if(__fail==='after-commit'&&!__failed){__failed=true;throw new Error('Simulated lost response.');}
                value={ok:true,requestId:b.requestId,requestCount:b.selections.length,status:'Pending review'};}
            }else throw new Error('Unexpected endpoint: '+url);
            return {ok:status<400,status,json:async()=>structuredClone(value)};
          };
        }''',{'submitted':submitted,'failure':failure})
        page.add_script_tag(content=(root/'public/app.js').read_text())
        page.locator('#school-search').wait_for()
    def select_school():
        page.locator('#school-search').fill('TEST-101');page.locator('.school-option').first.click()
    def review():
        select_school();page.locator('#pathways-reviewed').check();page.locator('#school-next').click()
        page.locator('[data-select-session="OH-A"]').first.check();page.locator('#sessions-next').click()
        page.locator('#request-ack').check()
    def blocked():
        expect(page.get_by_role('heading',name='Already submitted',exact=True)).to_be_visible()
        expect(page.locator('#school-next')).not_to_be_visible()
        assert page.locator('#school-content .coordinator-card').count()==0
        assert page.locator('#school-content [data-pathway]').count()==0
        assert page.locator('#session-list').count()==0
        assert page.locator('[data-step="2"]').is_disabled()
        assert page.locator('[data-step="3"]').is_disabled()
    load(submitted=True)
    page.locator('#school-search').fill('TEST')
    expect(page.locator('.school-submitted-tag')).to_have_text('Already submitted')
    page.locator('.school-option').first.click();blocked()
    page.screenshot(path=str(root/'screenshots/06-already-submitted.png'),full_page=True)
    summary.append('Already-submitted badge and school-wide blocker: passed')
    assert page.get_by_text('Example Coordinator',exact=True).count()==0
    assert page.get_by_text('Example Teacher',exact=True).count()==0
    summary.append('Returning schools receive no coordinator, teacher or selection details: passed')
    load();page.evaluate('window.__serverSubmitted=true');select_school();blocked()
    summary.append('Stale dropdown status is refreshed on school selection: passed')
    load();review();page.evaluate('window.__serverSubmitted=true');page.locator('#submit-request').click();blocked()
    assert page.evaluate('window.__commits')==0
    assert page.get_by_role('button',name='Retry the same request').count()==0
    summary.append('Another tab submits first: stale form transitions to blocked view on HTTP 409: passed')
    load(failure='after-commit');review();page.locator('#submit-request').click()
    expect(page.locator('#submit-error')).to_be_visible()
    page.get_by_role('button',name=re.compile('Retry the same request')).click()
    expect(page.get_by_role('heading',name='Your request has been received')).to_be_visible()
    assert page.evaluate('window.__commits')==1
    attempts=page.evaluate('window.__attempts');assert len(attempts)==2 and attempts[0]==attempts[1]
    summary.append('Lost response after save: identical retry returns receipt with only one simulated commit: passed')
    load(failure='before-commit');review();page.locator('#submit-request').click()
    expect(page.locator('#submit-error')).to_be_visible();assert page.evaluate('window.__commits')==0
    page.get_by_role('button',name=re.compile('Retry the same request')).click()
    expect(page.get_by_role('heading',name='Your request has been received')).to_be_visible()
    assert page.evaluate('window.__commits')==1
    summary.append('Lost connection before save: same request can safely retry: passed')
    load();review()
    page.evaluate("()=>{const b=document.querySelector('#submit-request');b.click();b.click();}")
    expect(page.get_by_role('heading',name='Your request has been received')).to_be_visible()
    assert page.evaluate('window.__attempts.length')==1
    assert page.get_by_role('button',name='Register another school').count()==0
    summary.append('Double-click sends only one request; no register-another-school action: passed')
    # Reload / another browser receives the persisted server-side state.
    page.set_viewport_size({'width':390,'height':844});load(submitted=True);select_school();blocked()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    page.screenshot(path=str(root/'screenshots/07-already-submitted-mobile.png'),full_page=True)
    summary.append('Returning school on a fresh mobile page is blocked without horizontal overflow: passed')
    assert not errors,errors
    summary.append('Browser JavaScript errors: 0')
    browser.close()
(root/'docs/once-browser-test-results.txt').write_text('\n'.join(summary)+'\n')
print('\n'.join(summary))
