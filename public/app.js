'use strict';
(() => {
  const I=window.NAEI18n;
  const $=(q,root=document)=>root.querySelector(q);
  const $$=(q,root=document)=>[...root.querySelectorAll(q)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=I.normalize;
  const ident=value=>I.digits(value).replace(/\s+/g,'').toUpperCase();
  let initialLanguage='en';try{initialLanguage=I.language(localStorage.getItem('nae-language'));}catch{}
  const state={lang:initialLanguage,ready:false,loadFailure:null,step:1,furthest:1,schools:[],config:null,school:null,chosenSchool:null,pathways:[],pathwaysReviewed:false,
    coordinatorAction:'',coordinatorDraft:{},selections:{},regionalChoices:{},addedTeachers:[],teacherIdentifiers:{},requestId:crypto.randomUUID(),searchQuery:'',
    accessCode:'',submitting:false,locked:false,sentPayload:null,receipt:null,ackOnce:false,ackEmail:false,teacherDraft:{}};
  const t=(key,values={})=>I.t(key,state.lang,values);
  const h=(key,values={})=>esc(t(key,values));
  const policy=(key,values={})=>I.policyText(key,state.lang,values);
  const schoolName=s=>I.schoolName(s,state.lang);
  const schoolChoiceLabel=s=>state.lang==='ar'?schoolName(s)+' - '+s.schoolEsis:s.schoolEsis+' - '+schoolName(s);
  const personName=p=>I.personName(p,state.lang);
  const region=r=>t(r);
  const dateFull=value=>I.dateFull(value,state.lang);
  const sessionTime=value=>I.time(value,state.lang);
  const sessionLanguage=s=>t(s?.sessionLanguage||'');
  const sessionPathway=s=>s?.pathway==='Performing Arts'?t('Performing Arts - Drama'):t(s?.pathway||'');
  const errorText=error=>I.error(error.message||'We could not complete this action. Check your connection and try again.',state.lang);
  const arrow=forward=>`<span aria-hidden="true">${(state.lang==='ar')!==!forward?'&#8592;':'&#8594;'}</span>`;
  const labels=['School details','Training registration','Review & submit'];
  const hints=['Pathways & coordinator','One teacher per pathway session','Send requests for review'];
  const dhafraRegionalPathways=['Literary Arts','Digital Arts','Visual Arts'];
  let schoolLoadVersion=0,searchIndex=-1,searchMatches=[],activeSession=null,teacherDialogMode='choose',toastTimer;
  const main=$('#main');
  function announce(text){$('#live-message').textContent=text;}
  function toast(text){const node=$('#toast');node.textContent=text;node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,4500);}
  function translateStatic(){
    document.documentElement.lang=state.lang;document.documentElement.dir=state.lang==='ar'?'rtl':'ltr';
    document.title=t('Training registration | NAE 2026');
    $$('[data-i18n]').forEach(n=>n.textContent=t(n.dataset.i18n));
    $$('[data-i18n-label]').forEach(n=>n.setAttribute('aria-label',t(n.dataset.i18nLabel)));
    $$('[data-language-toggle]').forEach(n=>{n.textContent=state.lang==='en'?'العربية':'English';n.lang=state.lang==='en'?'ar':'en';n.dir=state.lang==='en'?'rtl':'ltr';n.setAttribute('aria-label',state.lang==='en'?'Switch to Arabic':'التبديل إلى الإنجليزية');});
    const note=$('#setup-note');
    if(state.config){note.hidden=state.config.storageConfigured&&!state.config.previewOnly;note.textContent=t(state.config.previewOnly?'Local interface preview: no requests will be submitted.':'Administrator setup required: request storage is not connected. You can review the interface, but submission is disabled.');}
  }
  function switchLanguage(){
    const scroll=window.scrollY,focused=document.activeElement?.id,open=$('#teacher-dialog').open;
    state.lang=state.lang==='en'?'ar':'en';try{localStorage.setItem('nae-language',state.lang);}catch{}
    translateStatic();$('#toast').hidden=true;
    if(state.ready)render(false);
    else if(state.loadFailure)renderLoadFailure(state.loadFailure);
    else if(!state.config)main.innerHTML=`<div class="panel loading"><span class="spinner" aria-hidden="true"></span>${h('Opening training registration...')}</div>`;
    if(open)renderTeacherDialog();
    if(focused)document.getElementById(focused)?.focus({preventScroll:true});
    window.scrollTo({top:scroll,behavior:'instant'});
  }
  $$('[data-language-toggle]').forEach(n=>n.onclick=switchLanguage);
  async function request(url,options={}) {
    let response;
    try{response=await fetch(url,{cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),'Accept-Language':state.lang,...options.headers}});}
    catch{throw new Error('We could not complete this action. Check your connection and try again.');}
    let body;try{body=await response.json();}catch{throw new Error('The server did not return a valid response. Please try again.');}
    if(!response.ok)throw Object.assign(new Error(body.error||'Please try again.'),{status:response.status,code:body.code});
    return body;
  }
  function accessHeaders(){return state.accessCode?{'X-School-Access-Code':state.accessCode}:{};}
  function dateParts(value){const d=new Date(value+'T12:00:00+04:00');return {day:d.getUTCDate(),month:new Intl.DateTimeFormat(state.lang==='ar'?'ar-AE':'en',{month:'short',timeZone:'Asia/Dubai'}).format(d)};}
  function regionalSessions(pathway){return state.config.sessions.filter(s=>s.pathway===pathway&&['Abu Dhabi','Al Ain'].includes(s.region));}
  function currentSessions(){return state.config.sessions.filter(s=>{
    if(s.pathway==='Oral History')return true;
    if(!state.pathways.includes(s.pathway))return false;
    if(s.pathway==='Performing Arts')return s.region==='Abu Dhabi';
    if(state.school.region==='Al Dhafra')return state.regionalChoices[s.pathway]===s.region;
    return s.region===state.school.region;
  });}
  function getSession(id){return state.config.sessions.find(s=>s.id===id);}
  function teacherById(id){return state.school?.teachers.find(t=>t.id===id)||state.addedTeachers.find(t=>t.id===id);}
  function candidates(session){
    const listed=state.school.teachers.filter(t=>session.pathway==='Oral History'||t.pathways.includes(session.pathway));
    const people=[...listed,...state.addedTeachers];
    const selected=teacherById(state.selections[session.id]);
    if(selected&&!people.some(p=>p.id===selected.id))people.push(selected);
    return people.filter((p,i,arr)=>arr.findIndex(x=>x.id===p.id)===i);
  }
  function selectedEntries(){return currentSessions().filter(s=>state.selections[s.id]).map(s=>({session:s,teacher:teacherById(state.selections[s.id])}));}
  function coordinator(){return ['add','change'].includes(state.coordinatorAction)?state.coordinatorDraft:state.school.coordinator;}
  function coordinatorStatus(){return t({verified:'Verified on file',confirm:'Confirmed by school',change:'Change requested',add:'New coordinator submitted'}[state.coordinatorAction]||'');}
  function steps(){
    $('#steps').innerHTML=labels.map((label,i)=>{
      const n=i+1,done=state.step>n,current=state.step===n;
      return `<button type="button" class="step ${current?'current':''} ${done?'done':''}" data-step="${n}" ${current?'aria-current="step"':''} ${state.receipt||state.locked||(state.school?.alreadySubmitted&&n>1)||n>state.furthest?'disabled':''}><span class="step-number">${done?'&#10003;':n}</span><span><strong>${h(label)}</strong><small>${h(hints[i])}</small></span></button>`;
    }).join('');
    $$('[data-step]').forEach(button=>button.onclick=()=>{
      const n=Number(button.dataset.step);
      if(n===state.step)return;
      if(n<state.step){state.step=n;render();return;}
      if(state.step===1 && !validSchool())return;
      if(n===3 && !validSessions())return;
      state.step=n;render();
    });
  }
  function render(focus=true){
    steps();if(state.receipt)renderSuccess();else if(state.step===1)renderSchool();else if(state.step===2)renderSessions();else renderReview();
    if(focus){main.focus({preventScroll:true});main.scrollIntoView({behavior:'smooth',block:'start'});}
  }
  function field(key,label,value='',options={}){
    const direction=options.dir||(['nameEnglish','esis','emiratesId','workEmail','primaryEmail','mobile','access-code'].includes(key)?'ltr':'auto');
    return `<label class="field ${options.full?'full':''}" for="${options.prefix||''}${key}"><span>${h(label)} <span class="required" aria-hidden="true">*</span></span><input id="${options.prefix||''}${key}" name="${key}" type="${options.type||'text'}" value="${esc(value)}" required maxlength="${options.max||160}" dir="${direction}" ${options.inputmode?'inputmode="'+options.inputmode+'"':''} autocomplete="off" ${options.placeholder?'placeholder="'+h(options.placeholder)+'"':''}>${options.help?'<small>'+h(options.help)+'</small>':''}</label>`;
  }
  function bindValidity(root){
    $$('input',root).forEach(input=>{
      input.addEventListener('input',()=>input.setCustomValidity(''));
      input.oninvalid=()=>{input.setCustomValidity('');if(input.validity.valueMissing)input.setCustomValidity(t('Please complete this field.'));else if(input.validity.typeMismatch)input.setCustomValidity(t('Enter a valid email address.'));else if(!input.validity.valid)input.setCustomValidity(t('Please check this value.'));};
    });
  }
  function renderSchool(){
    const school=state.school,selected=school||state.chosenSchool;
    main.innerHTML=`<section class="panel"><div class="panel-heading"><div><p class="eyebrow">${h('STEP 01')}</p><h2>${h('Start with your school')}</h2><p class="muted">${h('Find your school, review its pathways, and check the coordinator.')}</p></div></div>
      <label class="field" for="school-search">${h('School name or eSIS')}</label>
      <div class="search-shell"><span class="search-icon" aria-hidden="true">&#8981;</span><input class="search-input" id="school-search" type="text" dir="auto" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="school-options" autocomplete="off" placeholder="${h('Type a school name or eSIS number')}" value="${esc(selected?schoolChoiceLabel(selected):state.searchQuery)}"><button class="search-toggle" type="button" aria-label="${h('Show school list')}">&#8964;</button><div id="school-options" class="search-list" role="listbox" hidden></div></div>
      <div id="school-loading" class="helper" role="status" hidden></div><div id="school-access" hidden></div><div id="school-content"></div><p id="school-error" class="form-error" role="alert" hidden></p>
      <div class="actions"><p class="helper">${h('Your contact details are not displayed publicly.')}</p><button class="button primary" id="school-next" type="button" ${school&&!school.alreadySubmitted?'':'disabled'}>${h('Continue to training registration')} ${arrow(true)}</button></div></section>`;
    bindSearch();if(school){if(school.alreadySubmitted)renderAlreadySubmitted();else renderSchoolDetails();}
    else if(state.chosenSchool&&state.config.requireAccessCode)renderAccess();
    $('#school-next').onclick=()=>{if(validSchool()){state.step=2;state.furthest=Math.max(state.furthest,2);render();}};
  }
  function bindSearch(){
    const input=$('#school-search'),list=$('#school-options');
    function open(query){
      const terms=norm(query).trim().split(/\s+/).filter(Boolean);
      searchMatches=state.schools.filter(s=>terms.every(term=>norm(s.schoolName+' '+s.schoolNameArabic+' '+s.schoolEsis).includes(term)));
      searchIndex=-1;list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
      list.innerHTML=searchMatches.length?searchMatches.map((s,i)=>`<div id="school-option-${i}" class="school-option" role="option" aria-selected="false" data-school-option="${i}"><strong dir="auto">${esc(schoolName(s))}</strong><small><bdi>${esc(s.schoolEsis)}</bdi> &middot; ${esc(region(s.region))}</small>${s.alreadySubmitted?'<span class="school-submitted-tag">'+h('Already submitted')+'</span>':''}</div>`).join(''):'<div class="search-empty">'+h('No matching school. Try part of the name or its eSIS number.')+'</div>';
      $$('[data-school-option]',list).forEach(option=>option.onmousedown=e=>{e.preventDefault();pickSchool(searchMatches[Number(option.dataset.schoolOption)]);close();});
      announce(t(searchMatches.length?'School suggestions updated. Use the arrow keys and Enter to choose.':'No matching school.'));
    }
    function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
    input.oninput=()=>{
      state.searchQuery=input.value;
      if(state.school||state.chosenSchool){schoolLoadVersion++;state.school=null;state.chosenSchool=null;state.selections={};state.regionalChoices={};state.addedTeachers=[];state.furthest=1;$('#school-content').innerHTML='';$('#school-access').hidden=true;$('#school-next').disabled=true;steps();}
      $('#school-error').hidden=true;open(input.value);
    };
    input.onfocus=()=>open(state.school||state.chosenSchool?'':input.value);
    input.onblur=()=>setTimeout(close,140);
    input.onkeydown=e=>{
      if(['ArrowDown','ArrowUp'].includes(e.key)){
        e.preventDefault();if(list.hidden)open(state.school?'':input.value);
        if(!searchMatches.length)return;
        searchIndex=Math.max(0,Math.min(searchMatches.length-1,searchIndex+(e.key==='ArrowDown'?1:-1)));
        $$('.school-option',list).forEach((o,i)=>{o.classList.toggle('active',i===searchIndex);o.setAttribute('aria-selected',i===searchIndex?'true':'false');});
        const active=$('#school-option-'+searchIndex);input.setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});
      } else if(e.key==='Enter'&&!list.hidden&&searchIndex>=0){e.preventDefault();pickSchool(searchMatches[searchIndex]);close();}
      else if(e.key==='Escape')close();
    };
    $('.search-toggle').onclick=()=>{if(list.hidden){input.focus();open(state.school?'':input.value);}else close();};
  }
  async function pickSchool(school){
    schoolLoadVersion++;state.locked=false;state.sentPayload=null;
    state.chosenSchool=school;state.school=null;state.accessCode='';state.selections={};state.regionalChoices={};state.addedTeachers=[];state.teacherIdentifiers={};state.coordinatorDraft={};state.pathwaysReviewed=false;state.requestId=crypto.randomUUID();state.furthest=1;state.ackOnce=false;state.ackEmail=false;state.searchQuery='';
    $('#school-search').value=schoolChoiceLabel(school);$('#school-next').disabled=true;$('#school-content').innerHTML='';$('#school-error').hidden=true;
    if(state.config.requireAccessCode&&!school.alreadySubmitted)renderAccess();else await loadSchool(school);
  }
  function renderAccess(){
    const access=$('#school-access');access.hidden=false;access.innerHTML=`<div class="notice"><strong>${h('Enter your school access code')}</strong><p class="helper">${h('Use the code provided to your school to open its details.')}</p><div class="field-grid">${field('access-code','School access code',state.accessCode,{placeholder:'Enter the school code'})}<div><button class="button primary" type="button" id="unlock-school">${h('Open school details')}</button></div></div></div>`;
    $('#access-code').oninput=e=>state.accessCode=e.target.value;
    $('#unlock-school').onclick=()=>loadSchool(state.chosenSchool);
    $('#access-code').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#unlock-school').click();}};
  }
  async function loadSchool(school){
    const version=++schoolLoadVersion;const loading=$('#school-loading');loading.hidden=false;loading.innerHTML='<span class="spinner" aria-hidden="true"></span>'+h('Opening your school details...');
    try{
      const result=await request('/api/school?esis='+encodeURIComponent(school.schoolEsis),{headers:accessHeaders()});
      if(version!==schoolLoadVersion)return;
      if(result.alreadySubmitted){showAlreadySubmitted(result);return;}
      state.school=result;state.pathways=[...result.registeredPathways];state.coordinatorAction=result.coordinator.verified?'verified':result.coordinator.listed?'':'add';
      state.coordinatorDraft={};$('#school-access').hidden=true;$('#school-error').hidden=true;renderSchoolDetails();$('#school-next').disabled=false;
      announce(t('School selected. Review pathways and coordinator below.'));
    }catch(error){if(version===schoolLoadVersion)showError('#school-error',errorText(error));}
    finally{if(version===schoolLoadVersion&&$('#school-loading'))$('#school-loading').hidden=true;}
  }
  function showAlreadySubmitted(school){
    state.school={schoolEsis:school.schoolEsis,schoolName:school.schoolName,schoolNameArabic:school.schoolNameArabic||state.schools.find(s=>s.schoolEsis===school.schoolEsis)?.schoolNameArabic,region:school.region,alreadySubmitted:true};
    state.chosenSchool=state.school;state.step=1;state.furthest=1;state.locked=false;state.submitting=false;
    state.sentPayload=null;state.selections={};state.regionalChoices={};state.addedTeachers=[];state.teacherIdentifiers={};
    state.coordinatorDraft={};state.coordinatorAction='';state.pathways=[];state.pathwaysReviewed=false;state.ackOnce=false;state.ackEmail=false;
    const entry=state.schools.find(s=>s.schoolEsis===school.schoolEsis);if(entry)entry.alreadySubmitted=true;
    render();announce(t('Already submitted. Your school cannot submit another training registration request.'));
  }
  function renderAlreadySubmitted(){
    const school=state.school;
    $('#school-content').innerHTML=`<section class="submitted-school" aria-labelledby="already-submitted-title" role="status"><div class="submitted-school-icon" aria-hidden="true">&#10003;</div><span class="badge pending">${h('Request on file')}</span><h3 id="already-submitted-title">${h('Already submitted')}</h3><p class="submitted-school-name" dir="auto">${esc(schoolName(school))}</p><p class="helper">${h('School eSIS')} <bdi>${esc(school.schoolEsis)}</bdi> &middot; ${esc(region(school.region))}</p><p>${h('A training registration request has already been submitted for this school.')} <strong>${h('Each school can submit only once.')}</strong></p><p>${h('Requests are subject to review. Selected teachers will be notified by email.')}</p><p class="helper">${h('For questions, please contact NAE Team. You may close this page.')}</p></section>`;
    $('#school-next').disabled=true;$('#school-next').closest('.actions').hidden=true;$('#school-access').hidden=true;$('#school-error').hidden=true;
  }
  function pathwayOption(pathway){
    const registered=state.school.registeredPathways.includes(pathway);
    return `<label class="pathway-option"><input type="checkbox" data-pathway="${esc(pathway)}" ${state.pathways.includes(pathway)?'checked':''}><span>${h(pathway)}</span><small>${h(registered?'On file':'Add pathway')}</small></label>`;
  }
  function renderSchoolDetails(){
    $('#school-next').closest('.actions').hidden=false;
    const school=state.school,c=school.coordinator;
    $('#school-content').innerHTML=`<div class="school-card"><span class="school-symbol" aria-hidden="true">&#8962;</span><div><h3 dir="auto">${esc(schoolName(school))}</h3><p>${h('School eSIS')} <bdi>${esc(school.schoolEsis)}</bdi> &middot; ${esc(region(school.region))}</p></div></div>
      <p class="notice once-notice"><strong>${h('One request per school.')}</strong> ${h('Please include all your workshop selections before submitting. You will not be able to send a second request.')}</p><hr class="section-rule"><div class="section-label"><h3>${h('Your school pathways')}</h3><span class="section-number">01</span></div>
      <p class="helper">${h(school.registeredPathways.length?'Your registered pathways are selected below. Check the list and add any others your school will participate in.':'No pathways are currently listed for your school. Select the pathways your school will participate in.')}</p>
      <div class="pathway-groups"><div><p class="group-label">${h('Competition pathways')}</p>${['Literary Arts','Performing Arts'].map(pathwayOption).join('')}</div><div><p class="group-label">${h('Participation pathways')}</p>${['Visual Arts','Digital Arts','Applied Arts'].map(pathwayOption).join('')}</div></div>
      <label class="check-line"><input id="pathways-reviewed" type="checkbox" ${state.pathwaysReviewed?'checked':''}><span>${h('I have reviewed the pathways selected for this school.')}</span></label>
      <hr class="section-rule"><div class="section-label"><h3>${h('School coordinator')}</h3><span class="section-number">02</span></div>
      ${c.listed?`<div class="coordinator-card"><div><p class="muted">${h('Coordinator on file')}</p><strong dir="auto">${esc(personName(c))}</strong></div><span class="badge ${c.verified?'verified':'pending'}">${c.verified?'&#10003; '+h('Verified'):h('Awaiting confirmation')}</span></div>`:'<p class="helper">'+h('No coordinator is currently listed. Please add your school coordinator below.')+'</p>'}
      ${c.listed&&!c.verified?`<div class="coordinator-actions"><label class="choice-box"><input type="radio" name="coordinator-action" value="confirm" ${state.coordinatorAction==='confirm'?'checked':''}>${h('Confirm this coordinator')}</label><label class="choice-box"><input type="radio" name="coordinator-action" value="change" ${state.coordinatorAction==='change'?'checked':''}>${h('Change coordinator')}</label></div>`:''}
      ${c.verified?'<p class="helper">'+h('The coordinator has already been verified. No action is needed.')+'</p>':''}<div id="coordinator-entry"></div>`;
    $$('[data-pathway]').forEach(input=>input.onchange=()=>{
      state.pathways=state.config.officialPathways.filter(p=>$$('[data-pathway]').some(n=>n.dataset.pathway===p&&n.checked));
      state.pathwaysReviewed=false;$('#pathways-reviewed').checked=false;
      if(state.school.region==='Al Dhafra'){for(const pathway of dhafraRegionalPathways){if(!state.pathways.includes(pathway)){delete state.regionalChoices[pathway];for(const session of regionalSessions(pathway))delete state.selections[session.id];}}}
      const allowed=new Set(currentSessions().map(s=>s.id));let removed=0;
      for(const id of Object.keys(state.selections)){if(!allowed.has(id)){delete state.selections[id];removed++;}}
      if(removed)toast(t('Selections for removed pathways were cleared.'));
    });
    $('#pathways-reviewed').onchange=e=>state.pathwaysReviewed=e.target.checked;
    $$('[name="coordinator-action"]').forEach(input=>input.onchange=()=>{state.coordinatorAction=input.value;renderCoordinatorEntry();});
    renderCoordinatorEntry();
  }
  function renderCoordinatorEntry(){
    const node=$('#coordinator-entry');if(!['add','change'].includes(state.coordinatorAction)){node.innerHTML='';return;}
    const d=state.coordinatorDraft;
    const specs=[['nameEnglish','Coordinator Full Name - English'],['nameArabic','Coordinator Full Name - Arabic',{dir:'rtl'}],['esis','eSIS/PASS Number'],['position','Position/Designation'],['emiratesId','Emirates ID',{inputmode:'numeric',placeholder:'784-0000-0000000-0',help:'15 digits, starting with 784.'}],['workEmail','Work Email',{type:'email'}],['primaryEmail','Primary Email',{type:'email'}],['mobile','Contact Mobile',{type:'tel',inputmode:'tel'}]];
    node.innerHTML=`<form id="coordinator-form" class="coordinator-form"><h4>${h(state.coordinatorAction==='change'?'New coordinator details':'Add a school coordinator')}</h4><p class="helper">${h('All fields are required. Contact details and identity information are kept out of the school-facing summary.')}</p><div class="field-grid">${specs.map(([key,label,opts])=>field(key,label,d[key],{prefix:'coord-',...opts})).join('')}</div></form>`;
    $('#coordinator-form').onsubmit=e=>e.preventDefault();
    $$('#coordinator-form input').forEach(input=>input.oninput=()=>state.coordinatorDraft[input.name]=input.value);
    bindValidity($('#coordinator-form'));
  }
  function showError(selector,text){const node=$(selector);if(!node)return;node.textContent=text;node.hidden=false;node.scrollIntoView({behavior:'smooth',block:'nearest'});announce(text);}
  function validSchool(){
    if(!state.school){showError('#school-error',t('Choose your school from the dropdown.'));return false;}
    if(state.school.alreadySubmitted){showAlreadySubmitted(state.school);return false;}
    if(!state.pathwaysReviewed){showError('#school-error',t('Please review your school pathways and tick the acknowledgement.'));$('#pathways-reviewed').focus();return false;}
    if(!state.coordinatorAction){showError('#school-error',t('Please confirm the listed coordinator or choose Change coordinator.'));return false;}
    if(['add','change'].includes(state.coordinatorAction)){
      const form=$('#coordinator-form');if(form&&!form.reportValidity())return false;
      const eid=I.digits(state.coordinatorDraft.emiratesId||'').replace(/[\s-]/g,'');
      if(!/^784\d{12}$/.test(eid)){showError('#school-error',t('Enter a 15-digit Emirates ID starting with 784.'));$('#coord-emiratesId')?.focus();return false;}
      const digits=I.digits(state.coordinatorDraft.mobile||'').replace(/\D/g,'');
      if(!/^\d{7,15}$/.test(digits)){showError('#school-error',t('Enter a valid coordinator contact mobile.'));return false;}
    }
    if($('#school-error'))$('#school-error').hidden=true;return true;
  }
  function teacherRow(teacher,session){
    const selected=state.selections[session.id]===teacher.id,added=teacher.id.startsWith('A-');
    const primary=personName(teacher),secondary=state.lang==='ar'?teacher.nameEnglish:teacher.nameArabic;
    const initials=primary.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join(state.lang==='ar'?' ':'').toUpperCase();
    return `<div class="teacher-row"><div class="teacher-info"><span class="teacher-avatar" aria-hidden="true">${esc(initials)}</span><div><strong dir="auto">${esc(primary)}</strong>${secondary&&secondary!==primary?'<small dir="auto">'+esc(secondary)+'</small>':''}<small>${teacher.esis?'<bdi>eSIS/PASS '+esc(teacher.esis)+'</bdi>':h('eSIS/PASS required when selected')}${teacher.isCoordinator?' &middot; '+h('Coordinator'):''}${added?' &middot; '+h('Added teacher'):''}</small></div></div><label class="teacher-radio"><input type="radio" name="session-${esc(session.id)}" value="${esc(teacher.id)}" data-select-session="${esc(session.id)}" ${selected?'checked':''}><span>${h('Register for Training')}</span></label></div>`;
  }
  function sessionBody(s){
    const people=candidates(s),teacher=teacherById(state.selections[s.id]);
    return `<div class="session-body">${people.length?people.map(p=>teacherRow(p,s)).join(''):'<p class="empty-session">'+h('No teacher is currently listed for this session. Use the button below to select someone from the school record or add a new teacher.')+'</p>'}
      ${teacher&&!teacher.esis?`<div class="identifier-fix"><label class="field">${h('eSIS/PASS Number for {name}',{name:personName(teacher)})}<input type="text" dir="ltr" data-teacher-identifier="${esc(teacher.id)}" value="${esc(state.teacherIdentifiers[teacher.id]||'')}" placeholder="${h('Enter the missing eSIS/PASS number')}" required maxlength="80"></label></div>`:''}
      ${teacher?`<div class="selected-summary"><span>${h('Requested teacher:')} <strong dir="auto">${esc(personName(teacher))}</strong></span><button class="button text small" type="button" data-clear-session="${esc(s.id)}">${h('Clear')}</button></div>`:''}
      <button class="button session-add" type="button" data-add-session="${esc(s.id)}"><span aria-hidden="true">+</span> ${h('Register another teacher for this session')}</button></div>`;
  }
  function sessionCard(s){
    const booked=(state.school.bookedSessionIds||[]).includes(s.id),selected=state.selections[s.id],date=dateParts(s.date);
    return `<article class="session-card ${selected?'has-selection':''}" id="card-${esc(s.id)}"><div class="session-header"><div class="session-title"><div class="date-tile" aria-hidden="true"><strong>${date.day}</strong><small>${esc(date.month)}</small></div><div><h3>${esc(sessionPathway(s))}</h3><div class="session-meta"><span>${esc(region(s.region))}</span><span aria-hidden="true">&middot;</span><span>${esc(sessionTime(s.time))}</span><span aria-hidden="true">&middot;</span><span>${h('Language')}: ${esc(sessionLanguage(s))}</span></div><div class="session-date-full">${esc(dateFull(s.date))}</div></div></div><span class="badge ${selected?'selected':booked?'pending':''}">${h(booked?'Already requested':selected?'1 teacher selected':'Choose 1 teacher')}</span></div>${sessionBody(s)}</article>`;
  }
  function pathwayId(pathway){return pathway.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
  function dhafraPathwayCard(pathway){
    const options=regionalSessions(pathway),chosenRegion=state.regionalChoices[pathway]||'',session=options.find(s=>s.region===chosenRegion),selected=session&&state.selections[session.id];
    const optionHtml=options.map(s=>`<label class="region-option"><input type="radio" name="region-${esc(pathwayId(pathway))}" data-region-pathway="${esc(pathway)}" value="${esc(s.region)}" ${chosenRegion===s.region?'checked':''}><span><strong>${esc(region(s.region))}</strong><small>${esc(dateFull(s.date))}</small><small>${esc(sessionTime(s.time))}</small><small>${h('Language')}: ${esc(sessionLanguage(s))}</small></span></label>`).join('');
    return `<article class="session-card regional-pathway-card ${selected?'has-selection':''}" id="pathway-card-${esc(pathwayId(pathway))}"><div class="session-header"><div><h3>${h(pathway)}</h3><div class="session-meta">${session?`<span>${esc(region(session.region))}</span><span aria-hidden="true">&middot;</span><span>${esc(sessionTime(session.time))}</span><span aria-hidden="true">&middot;</span><span>${h('Language')}: ${esc(sessionLanguage(session))}</span>`:'<span>'+h('Choose Abu Dhabi or Al Ain')+'</span>'}</div>${session?`<div class="session-date-full">${esc(dateFull(session.date))}</div>`:''}</div><span class="badge ${selected?'selected':''}">${h(selected?'1 teacher selected':session?'Choose 1 teacher':'Choose region')}</span></div>
      <div class="region-choice"><p><strong>${h('Choose one training region for this pathway.')}</strong> ${h('Your school can request either Abu Dhabi or Al Ain, not both.')}</p><div class="region-options">${optionHtml}</div></div>
      ${session?sessionBody(session):'<div class="region-waiting">'+h('Select a region above to see the teachers available for this pathway.')+'</div>'}</article>`;
  }
  function sessionMarkup(){
    if(state.school.region!=='Al Dhafra')return currentSessions().map(sessionCard).join('');
    const parts=[];
    for(const s of state.config.sessions.filter(s=>s.pathway==='Oral History'))parts.push(sessionCard(s));
    for(const pathway of ['Literary Arts','Digital Arts','Performing Arts','Visual Arts']){
      if(!state.pathways.includes(pathway))continue;
      if(pathway==='Performing Arts'){const s=state.config.sessions.find(x=>x.pathway===pathway&&x.region==='Abu Dhabi');if(s)parts.push(sessionCard(s));}
      else parts.push(dhafraPathwayCard(pathway));
    }
    return parts.join('');
  }
  function renderSessions(){
    main.innerHTML=`<div class="session-top"><div><p class="eyebrow">${h('STEP 02')}</p><h2>${h('Training registration')}</h2></div><p class="school-context"><bdi>${esc(schoolName(state.school))}</bdi> &middot; ${esc(region(state.school.region))}</p></div>
      <div class="notice"><strong>${h('One teacher per school, per pathway session.')}</strong> ${h('Select one teacher for each workshop you wish to request. The same teacher may be selected for different sessions.')}</div>
      ${state.school.region==='Al Dhafra'?'<div class="notice dhafra-note"><strong>'+h('Al Dhafra schools:')+'</strong> '+h('For Literary Arts, Digital Arts and Visual Arts, choose one training region first - Abu Dhabi or Al Ain. You cannot request both regional sessions for the same pathway.')+'</div>':''}
      <div id="session-list">${sessionMarkup()}</div><p id="sessions-error" class="form-error" role="alert" hidden></p>
      <div class="sticky-actions"><button class="button secondary" id="sessions-back" type="button">${arrow(false)}<span class="back-label">${h('School details')}</span></button><div class="count" id="selection-count"></div><button class="button primary" id="sessions-next" type="button">${h('Review requests')} ${arrow(true)}</button></div>`;
    $('#sessions-back').onclick=()=>{state.step=1;render();};
    $('#sessions-next').onclick=()=>{if(validSessions()){state.step=3;state.furthest=3;render();}};
    bindSessionEvents();updateCounter();
  }
  function bindSessionEvents(){
    $$('[data-region-pathway]').forEach(input=>input.onchange=()=>{
      const pathway=input.dataset.regionPathway,oldRegion=state.regionalChoices[pathway];
      for(const session of regionalSessions(pathway))delete state.selections[session.id];
      state.regionalChoices[pathway]=input.value;refreshPathway(pathway);updateCounter();
      announce(t('{pathway} training region set to {region}. Choose one teacher for this pathway session.',{pathway:t(pathway),region:region(input.value)}));
      if(oldRegion&&oldRegion!==input.value)toast(t('Region changed to {region}. The previous teacher selection for {pathway} was cleared.',{region:region(input.value),pathway:t(pathway)}));
    });
    $$('[data-select-session]').forEach(input=>input.onchange=()=>{
      const sid=input.dataset.selectSession;state.selections[sid]=input.value;refreshSession(sid);updateCounter();
      announce(t('Teacher selected for {pathway}. Only one teacher is selected for this session.',{pathway:t(getSession(sid).pathway)}));
    });
    $$('[data-clear-session]').forEach(button=>button.onclick=()=>{const sid=button.dataset.clearSession;delete state.selections[sid];refreshSession(sid);updateCounter();});
    $$('[data-add-session]').forEach(button=>button.onclick=()=>openTeacherDialog(button.dataset.addSession));
    $$('[data-teacher-identifier]').forEach(input=>input.oninput=()=>{
      state.teacherIdentifiers[input.dataset.teacherIdentifier]=input.value;
      $$('[data-teacher-identifier]').forEach(other=>{if(other!==input&&other.dataset.teacherIdentifier===input.dataset.teacherIdentifier)other.value=input.value;});
    });
  }
  function refreshPathway(pathway){const node=document.getElementById('pathway-card-'+pathwayId(pathway));if(node){node.outerHTML=dhafraPathwayCard(pathway);bindSessionEvents();}}
  function refreshSession(id){const session=getSession(id);if(state.school.region==='Al Dhafra'&&dhafraRegionalPathways.includes(session.pathway)){refreshPathway(session.pathway);return;}const node=document.getElementById('card-'+id);if(node){node.outerHTML=sessionCard(session);bindSessionEvents();}}
  function updateCounter(){const count=selectedEntries().length;$('#selection-count').innerHTML=state.lang==='ar'?h('Session requests: {count}',{count}):`<strong>${count}</strong> ${h(count===1?'session request':'session requests')}`;$('#sessions-next').disabled=count===0;}
  function validSessions(){
    if(state.school?.alreadySubmitted){showAlreadySubmitted(state.school);return false;}
    if(!selectedEntries().length){showError('#sessions-error',t('Select a teacher for at least one session.'));return false;}
    for(const {teacher} of selectedEntries()){
      if(!teacher.esis&&!String(state.teacherIdentifiers[teacher.id]||'').trim()){
        showError('#sessions-error',t('Enter the missing eSIS/PASS number for {name}.',{name:personName(teacher)}));
        $$('[data-teacher-identifier]').find(i=>i.dataset.teacherIdentifier===teacher.id)?.focus();return false;
      }
    }
    return true;
  }
  function teacherRecordRow(teacher){
    const primary=personName(teacher),secondary=state.lang==='ar'?teacher.nameEnglish:teacher.nameArabic;
    const detail=[teacher.esis?'eSIS/PASS '+teacher.esis:'',teacher.isCoordinator?t('Coordinator'):'',teacher.id.startsWith('A-')?t('Added teacher'):''].filter(Boolean).join(' · ');
    return `<button class="record-teacher-row" type="button" data-record-teacher="${esc(teacher.id)}"><span><strong dir="auto">${esc(primary)}</strong>${secondary&&secondary!==primary?'<small dir="auto">'+esc(secondary)+'</small>':''}<small>${esc(detail||t('On school record'))}</small></span><span class="record-select-label">${h('Select')}</span></button>`;
  }
  function recordPeople(){
    return [...state.school.teachers].sort((a,b)=>personName(a).localeCompare(personName(b),state.lang==='ar'?'ar':'en'));
  }
  function setDialogMode(mode){teacherDialogMode=mode;renderTeacherDialog();}
  function renderTeacherDialog(){
    const s=getSession(activeSession);if(!s)return;
    $('#dialog-context').textContent=sessionPathway(s)+' - '+region(s.region)+' - '+dateFull(s.date)+' - '+t('Language')+': '+sessionLanguage(s);
    const body=$('#teacher-dialog-body');
    if(teacherDialogMode==='choose'){
      body.innerHTML=`<p class="helper">${h('Choose an existing teacher from the school record or add a new teacher.')}</p><div class="teacher-source-options"><button class="teacher-source-card" type="button" data-teacher-source="record" aria-label="${h('Select a teacher from record')}"><strong>${h('Select a teacher from record')}</strong><span>${h('Choose anyone already listed for this school, including the coordinator. Their original pathway does not limit this session request.')}</span></button><button class="teacher-source-card" type="button" data-teacher-source="new" aria-label="${h('Add a new teacher')}"><strong>${h('Add a new teacher')}</strong><span>${h('Enter the details of a teacher who is not already on the school record.')}</span></button></div>`;
      $$('[data-teacher-source]',body).forEach(button=>button.onclick=()=>setDialogMode(button.dataset.teacherSource));
      return;
    }
    if(teacherDialogMode==='record'){
      const people=recordPeople();
      body.innerHTML=`<button class="button text small dialog-back" type="button" id="teacher-dialog-back">${arrow(false)} ${h('Back to teacher options')}</button><h3>${h('Select a teacher from record')}</h3><p class="helper">${h('Any person already listed for this school may be selected for this session, even if they were originally linked to another pathway.')}</p><div class="record-teacher-list">${people.length?people.map(teacherRecordRow).join(''):'<p class="empty-session">'+h('No teachers are currently on the school record. Add a new teacher instead.')+'</p>'}</div>${!people.length?'<button class="button primary" type="button" id="record-add-new">'+h('Add a new teacher')+'</button>':''}`;
      $('#teacher-dialog-back').onclick=()=>setDialogMode('choose');
      $$('#teacher-dialog-body [data-record-teacher]').forEach(button=>button.onclick=()=>{
        const teacher=teacherById(button.dataset.recordTeacher);if(!teacher)return;
        state.selections[activeSession]=teacher.id;const session=getSession(activeSession);$('#teacher-dialog').close();renderSessions();
        const card=document.getElementById('card-'+activeSession)||document.getElementById('pathway-card-'+pathwayId(session.pathway));card?.scrollIntoView({behavior:'smooth',block:'center'});
        toast(t('{name} is selected for this session.',{name:personName(teacher)}));
      });
      if($('#record-add-new'))$('#record-add-new').onclick=()=>setDialogMode('new');
      return;
    }
    body.innerHTML=`<button class="button text small dialog-back" type="button" id="teacher-dialog-back">${arrow(false)} ${h('Back to teacher options')}</button><form id="teacher-form"><p class="helper">${h('This teacher can also be selected for other sessions. All fields below are required.')}</p><div id="teacher-fields" class="field-grid"></div><p class="form-error" id="teacher-error" role="alert" hidden></p><div class="dialog-actions"><button class="button secondary" type="button" id="cancel-teacher">${h('Cancel')}</button><button class="button primary" type="submit">${h('Save and select teacher')}</button></div></form>`;
    $('#teacher-dialog-back').onclick=()=>setDialogMode('choose');$('#cancel-teacher').onclick=()=>$('#teacher-dialog').close();
    const specs=[['nameEnglish','Teacher Full Name - English'],['nameArabic','Teacher Full Name - Arabic',{dir:'rtl'}],['esis','eSIS/PASS Number'],['position','Position/Designation'],['workEmail','Work Email',{type:'email'}],['mobile','Contact Mobile',{type:'tel',inputmode:'tel'}]];
    $('#teacher-fields').innerHTML=specs.map(([key,label,opts])=>field(key,label,state.teacherDraft[key]||'',{prefix:'teacher-',...opts})).join('');
    $$('#teacher-fields input').forEach(input=>input.oninput=()=>state.teacherDraft[input.name]=input.value);
    bindValidity($('#teacher-form'));$('#teacher-error').hidden=true;
    $('#teacher-form').onsubmit=e=>{
      e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
      const teacher=Object.fromEntries(new FormData(form));for(const key of Object.keys(teacher))teacher[key]=String(teacher[key]).trim();teacher.esis=ident(teacher.esis);teacher.mobile=I.digits(teacher.mobile);
      if(!/^\d{7,15}$/.test(teacher.mobile.replace(/\D/g,''))){showError('#teacher-error',t('Please enter a valid contact mobile.'));return;}
      const known=state.school.teachers.find(r=>r.esis&&ident(r.esis)===teacher.esis);
      if(known){showError('#teacher-error',t('This teacher is already on the school record. Choose Select a teacher from record instead.'));return;}
      let added=state.addedTeachers.find(a=>ident(a.esis)===teacher.esis);
      if(added)Object.assign(added,teacher);else{added={...teacher,id:'A-'+crypto.randomUUID(),pathways:[],isCoordinator:false};state.addedTeachers.push(added);}
      state.selections[activeSession]=added.id;const session=getSession(activeSession);$('#teacher-dialog').close();renderSessions();
      const card=document.getElementById('card-'+activeSession)||document.getElementById('pathway-card-'+pathwayId(session.pathway));card?.scrollIntoView({behavior:'smooth',block:'center'});
      toast(t('{name} is selected for this session.',{name:personName(teacher)}));
    };
    $('#teacher-nameEnglish')?.focus();
  }
  function openTeacherDialog(sessionId){activeSession=sessionId;state.teacherDraft={};teacherDialogMode='choose';renderTeacherDialog();$('#teacher-dialog').showModal();$('[data-teacher-source="record"]')?.focus();}
  $('#close-dialog').onclick=()=>$('#teacher-dialog').close();
  $('#teacher-dialog').addEventListener('click',e=>{if(e.target===$('#teacher-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  function reviewRows(){return selectedEntries().map(({session:s,teacher:teacher})=>{const primary=personName(teacher),secondary=state.lang==='ar'?teacher.nameEnglish:teacher.nameArabic;return `<div class="review-session"><div><strong>${esc(sessionPathway(s))}</strong><small>${esc(dateFull(s.date))}</small><small>${esc(region(s.region))} &middot; ${esc(sessionTime(s.time))} &middot; ${h('Language')}: ${esc(sessionLanguage(s))}</small></div><div class="review-person"><strong dir="auto">${esc(primary)}</strong>${secondary&&secondary!==primary?'<small dir="auto">'+esc(secondary)+'</small>':''}<small><bdi>eSIS/PASS ${esc(teacher.esis||state.teacherIdentifiers[teacher.id])}</bdi></small></div></div>`;}).join('');}
  function timeRange(session){
    const parts=session.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);if(!parts)return null;
    const minutes=(h,m,meridian)=>(Number(h)%12+(meridian.toUpperCase()==='PM'?12:0))*60+Number(m);
    return [minutes(parts[1],parts[2],parts[3]),minutes(parts[4],parts[5],parts[6])];
  }
  function conflicts(){
    const entries=selectedEntries(),out=[];
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
      const a=entries[i],b=entries[j];if(a.session.date!==b.session.date)continue;
      const idA=ident(a.teacher.esis||state.teacherIdentifiers[a.teacher.id]),idB=ident(b.teacher.esis||state.teacherIdentifiers[b.teacher.id]);
      const ra=timeRange(a.session),rb=timeRange(b.session);
      if(idA&&idA===idB&&ra&&rb&&Math.max(ra[0],rb[0])<Math.min(ra[1],rb[1]))out.push(t('{name} has overlapping {first} and {second} requests on {date}.',{name:personName(a.teacher),first:sessionPathway(a.session),second:sessionPathway(b.session),date:dateFull(a.session.date)}));
    }
    return out;
  }
  function renderReview(){
    const entries=selectedEntries(),warnings=conflicts(),canSubmit=state.config.storageConfigured&&!state.config.previewOnly;
    main.innerHTML=`<section class="panel"><div class="panel-heading"><div><p class="eyebrow">${h('STEP 03')}</p><h2>${h('Review your requests')}</h2><p class="muted">${h('Check each name and session before sending them for review. This is your school’s only submission: include all sessions now.')}</p></div><span class="badge pending">${h('Not yet submitted')}</span></div>
      <div class="review-school"><div><h3 dir="auto">${esc(schoolName(state.school))}</h3><p class="helper">${h('School eSIS')} <bdi>${esc(state.school.schoolEsis)}</bdi> &middot; ${esc(region(state.school.region))}</p></div><button class="button text small" data-edit="1" type="button" ${state.locked?'disabled':''}>${h('Edit school details')}</button></div>
      <dl class="review-details"><div><dt>${h('School coordinator')}</dt><dd><strong dir="auto">${esc(personName(coordinator()))}</strong><br>${esc(coordinatorStatus())}</dd></div><div><dt>${h('School pathways reviewed')}</dt><dd>${state.pathways.length?state.pathways.map(p=>h(p)).join(state.lang==='ar'?'، ':', '):h('No school pathways selected')}</dd></div></dl></section>
      <section class="panel"><div class="section-label"><h3>${h('Session requests: {count}',{count:entries.length})}</h3><button class="button text small" data-edit="2" type="button" ${state.locked?'disabled':''}>${h('Edit selections')}</button></div>${reviewRows()}</section>
      ${warnings.length?'<div class="notice warning"><strong>'+h('Please review the timing')+'</strong>'+warnings.map(w=>'<p>'+esc(w)+'</p>').join('')+'</div>':''}
      <section class="panel"><form id="request-form" novalidate><h3>${h('Before you submit')}</h3><p class="helper">${h('Both acknowledgements below are required.')}</p>
      <label class="check-line acknowledgement"><input id="ack-once" name="ackOnce" type="checkbox" required ${state.ackOnce?'checked':''} ${state.locked?'disabled':''}><span>${esc(policy('onceOnly'))}<span class="required" aria-hidden="true"> *</span></span></label>
      <label class="check-line acknowledgement"><input id="ack-email" name="ackEmail" type="checkbox" required ${state.ackEmail?'checked':''} ${state.locked?'disabled':''}><span>${esc(policy('emailConfirmation'))}<span class="required" aria-hidden="true"> *</span></span></label>
      <p id="submit-error" class="form-error" role="alert" hidden></p>
      ${!canSubmit?'<p class="notice warning">'+h('Submission is not enabled yet. The administrator must finish the request-storage setup. No request has been sent.')+'</p>':''}
      <div class="actions"><button class="button secondary" data-edit="2" type="button" ${state.locked?'disabled':''}>${arrow(false)} ${h('Back')}</button><button class="button primary" id="submit-request" type="submit" ${!canSubmit||state.submitting?'disabled':''}>${state.submitting?'<span class="spinner" aria-hidden="true"></span>'+h('Sending your request...'):h(state.locked?'Retry the same request':'Submit registration request')+' '+arrow(true)}</button></div></form></section>`;
    $$('[data-edit]').forEach(button=>button.onclick=()=>{state.step=Number(button.dataset.edit);render();});
    $('#ack-once').onchange=e=>state.ackOnce=e.target.checked;$('#ack-email').onchange=e=>state.ackEmail=e.target.checked;
    $('#request-form').onsubmit=e=>{e.preventDefault();submit();};
  }
  function payload(){
    const selected=selectedEntries().map(({session,teacher})=>({sessionId:session.id,teacherId:teacher.id}));
    return {requestId:state.requestId,schoolEsis:state.school.schoolEsis,pathways:[...state.pathways],pathwaysReviewed:state.pathwaysReviewed,
      coordinator:{action:state.coordinatorAction,...(['add','change'].includes(state.coordinatorAction)?state.coordinatorDraft:{})},
      selections:selected,addedTeachers:state.addedTeachers.filter(t=>selected.some(s=>s.teacherId===t.id)),teacherIdentifiers:state.teacherIdentifiers,
      language:state.lang,acknowledgement:state.ackOnce&&state.ackEmail,acknowledgements:{onceOnly:state.ackOnce,emailConfirmation:state.ackEmail}};
  }
  async function submit(){
    if(state.submitting||state.receipt)return;
    if(state.school?.alreadySubmitted){showAlreadySubmitted(state.school);return;}
    if(!state.sentPayload){state.ackOnce=$('#ack-once').checked;state.ackEmail=$('#ack-email').checked;}
    if(!state.ackOnce||!state.ackEmail){showError('#submit-error',t('Please accept both acknowledgements before submitting.'));$(state.ackOnce?'#ack-email':'#ack-once').focus();return;}
    state.sentPayload=state.sentPayload||structuredClone(payload());state.submitting=true;state.locked=true;steps();renderReview();
    try{
      const result=await request('/api/register',{method:'POST',headers:accessHeaders(),body:JSON.stringify(state.sentPayload)});
      state.receipt=result;state.step=4;state.submitting=false;render();announce(t('Your request was received and is pending review.'));
      // Identity/contact details are never written to browser storage.
      const c=coordinator();state.coordinatorDraft={nameEnglish:c.nameEnglish,nameArabic:c.nameArabic};state.sentPayload=null;
    }catch(error){
      state.submitting=false;
      if(error.code==='SCHOOL_ALREADY_SUBMITTED'){showAlreadySubmitted(state.school);return;}
      if(error.status===400 || (error.status===409&&['SCHOOL_SESSION_TAKEN','DUPLICATE_RECORD'].includes(error.code))){state.locked=false;state.sentPayload=null;}
      renderReview();steps();showError('#submit-error',errorText(error)+(state.locked?' '+t('You can retry this same request without changing the details.'):''));
    }
  }
  function renderSuccess(){
    main.innerHTML=`<section class="panel success-panel"><div class="success-icon" aria-hidden="true">&#10003;</div><span class="badge pending">${h('Pending review')}</span><h2>${esc(policy('received'))}</h2><p class="thank-you-school" dir="auto">${esc(policy('thanks',{school:schoolName(state.school)}))}</p><p class="received-details">${esc(policy('receivedDetails'))}</p><p class="received-note"><strong>${esc(policy('receivedNote'))}</strong></p><div class="receipt">${h('Received session requests: {count}',{count:state.receipt.requestCount})}<br><strong>${h('Request reference')}</strong><code dir="ltr">${esc(state.receipt.requestId)}</code></div><button class="button secondary" id="print-request" type="button">${h('Print or save your request summary')}</button><p class="helper">${h('Your school has now used its single submission. No changes can be made afterward. You may close this page.')}</p></section><section class="panel"><h3>${h('Requested sessions')}</h3>${reviewRows()}</section>`;
    $('#print-request').onclick=()=>window.print();
  }
  function renderLoadFailure(error){main.innerHTML='<section class="panel"><h2>'+h('We could not open registration')+'</h2><p>'+esc(errorText(error))+'</p><button class="button primary" id="reload-page" type="button">'+h('Try again')+'</button></section>';$('#reload-page').onclick=start;}
  async function start(){
    state.loadFailure=null;translateStatic();main.innerHTML='<div class="panel loading"><span class="spinner" aria-hidden="true"></span>'+h('Opening training registration...')+'</div>';
    try{
      const [schools,config]=await Promise.all([request('/api/schools'),request('/api/config')]);state.schools=schools;state.config=config;state.ready=true;
      translateStatic();render(false);
    }catch(error){state.loadFailure=error;renderLoadFailure(error);}
  }
  window.addEventListener('beforeunload',event=>{if(state.locked&&!state.receipt){event.preventDefault();event.returnValue='';}});
  start();
})();
