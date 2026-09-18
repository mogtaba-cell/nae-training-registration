'use strict';
(() => {
  const $=(q,root=document)=>root.querySelector(q);
  const $$=(q,root=document)=>[...root.querySelectorAll(q)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const ident=value=>String(value??'').replace(/\s+/g,'').toUpperCase();
  const labels=['School details','Training registration','Review & submit'];
  const hints=['Pathways & coordinator','One teacher per pathway session','Send requests for review'];
  const dhafraRegionalPathways=['Literary Arts','Digital Arts','Visual Arts'];
  const state={step:1,furthest:1,schools:[],config:null,school:null,chosenSchool:null,pathways:[],pathwaysReviewed:false,
    coordinatorAction:'',coordinatorDraft:{},selections:{},regionalChoices:{},addedTeachers:[],teacherIdentifiers:{},requestId:crypto.randomUUID(),
    accessCode:'',submitting:false,locked:false,sentPayload:null,receipt:null};
  let schoolLoadVersion=0,searchIndex=-1,searchMatches=[],activeSession=null,toastTimer;
  const main=$('#main');
  function announce(text){$('#live-message').textContent=text;}
  function toast(text){const node=$('#toast');node.textContent=text;node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,4000);}
  async function request(url,options={}) {
    const response=await fetch(url,{cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
    let body;try{body=await response.json();}catch{throw new Error('The server did not return a valid response. Please try again.');}
    if(!response.ok)throw Object.assign(new Error(body.error||'Please try again.'),{status:response.status,code:body.code});
    return body;
  }
  function accessHeaders(){return state.accessCode?{'X-School-Access-Code':state.accessCode}:{};}
  function dateFull(value){return new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Dubai'}).format(new Date(value+'T12:00:00+04:00'));}
  function dateParts(value){const d=new Date(value+'T12:00:00+04:00');return {day:d.getUTCDate(),month:new Intl.DateTimeFormat('en',{month:'short',timeZone:'Asia/Dubai'}).format(d)};}
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
    const added=state.addedTeachers.filter(t=>{
      if(listed.some(r=>r.esis&&ident(r.esis)===ident(t.esis)))return false;
      const known=state.school.teachers.find(r=>r.esis&&ident(r.esis)===ident(t.esis));
      return !known || session.pathway==='Oral History' || !known.pathways.includes('Applied Arts') || known.pathways.includes(session.pathway);
    });
    return [...listed,...added];
  }
  function selectedEntries(){return currentSessions().filter(s=>state.selections[s.id]).map(s=>({session:s,teacher:teacherById(state.selections[s.id])}));}
  function coordinatorName(){return ['add','change'].includes(state.coordinatorAction)?state.coordinatorDraft.nameEnglish:state.school.coordinator.nameEnglish;}
  function coordinatorStatus(){return {verified:'Verified on file',confirm:'Confirmed by school',change:'Change requested',add:'New coordinator submitted'}[state.coordinatorAction]||'';}
  function steps(){
    $('#steps').innerHTML=labels.map((label,i)=>{
      const n=i+1,done=state.step>n,current=state.step===n;
      return `<button type="button" class="step ${current?'current':''} ${done?'done':''}" data-step="${n}" ${current?'aria-current="step"':''} ${state.receipt||state.locked||(state.school?.alreadySubmitted&&n>1)||n>state.furthest?'disabled':''}><span class="step-number">${done?'&#10003;':n}</span><span><strong>${label}</strong><small>${hints[i]}</small></span></button>`;
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
    return `<label class="field ${options.full?'full':''}" for="${options.prefix||''}${key}"><span>${esc(label)} <span class="required" aria-hidden="true">*</span></span><input id="${options.prefix||''}${key}" name="${key}" type="${options.type||'text'}" value="${esc(value)}" required maxlength="${options.max||160}" ${options.dir?'dir="'+options.dir+'"':''} ${options.inputmode?'inputmode="'+options.inputmode+'"':''} autocomplete="off" ${options.placeholder?'placeholder="'+esc(options.placeholder)+'"':''}>${options.help?'<small>'+esc(options.help)+'</small>':''}</label>`;
  }
  function renderSchool(){
    const school=state.school;
    main.innerHTML=`<section class="panel"><div class="panel-heading"><div><p class="eyebrow">STEP 01</p><h2>Start with your school</h2><p class="muted">Find your school, review its pathways, and check the coordinator.</p></div></div>
      <label class="field" for="school-search">School name or eSIS</label>
      <div class="search-shell"><span class="search-icon" aria-hidden="true">&#8981;</span><input class="search-input" id="school-search" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="school-options" autocomplete="off" placeholder="Type a school name or eSIS number" value="${esc(school?school.schoolEsis+' - '+school.schoolName:state.chosenSchool?state.chosenSchool.schoolEsis+' - '+state.chosenSchool.schoolName:'')}"><button class="search-toggle" type="button" aria-label="Show school list">&#8964;</button><div id="school-options" class="search-list" role="listbox" hidden></div></div>
      <div id="school-loading" class="helper" role="status" hidden></div><div id="school-access" hidden></div><div id="school-content"></div><p id="school-error" class="form-error" role="alert" hidden></p>
      <div class="actions"><p class="helper">Your contact details are not displayed publicly.</p><button class="button primary" id="school-next" type="button" ${school&&!school.alreadySubmitted?'':'disabled'}>Continue to training registration <span aria-hidden="true">&#8594;</span></button></div></section>`;
    bindSearch();if(school){if(school.alreadySubmitted)renderAlreadySubmitted();else renderSchoolDetails();}
    $('#school-next').onclick=()=>{if(validSchool()){state.step=2;state.furthest=Math.max(state.furthest,2);render();}};
  }
  function bindSearch(){
    const input=$('#school-search'),list=$('#school-options');
    function open(query){
      const terms=norm(query).trim().split(/\s+/).filter(Boolean);
      searchMatches=state.schools.filter(s=>terms.every(term=>norm(s.schoolName+' '+s.schoolEsis).includes(term))).slice(0,100);
      searchIndex=-1;list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
      list.innerHTML=searchMatches.length?searchMatches.map((s,i)=>`<div id="school-option-${i}" class="school-option" role="option" aria-selected="false" data-school-option="${i}"><strong>${esc(s.schoolName)}</strong><small>${esc(s.schoolEsis)} &middot; ${esc(s.region)}</small>${s.alreadySubmitted?'<span class="school-submitted-tag">Already submitted</span>':''}</div>`).join(''):'<div class="search-empty">No matching school. Try part of the name or its eSIS number.</div>';
      $$('[data-school-option]',list).forEach(option=>option.onmousedown=e=>{e.preventDefault();pickSchool(searchMatches[Number(option.dataset.schoolOption)]);close();});
      announce(searchMatches.length?'School suggestions updated. Use the arrow keys and Enter to choose.':'No matching school.');
    }
    function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
    input.oninput=()=>{
      if(state.school||state.chosenSchool){schoolLoadVersion++;state.school=null;state.chosenSchool=null;state.selections={};state.regionalChoices={};state.addedTeachers=[];state.furthest=1;$('#school-content').innerHTML='';$('#school-access').hidden=true;$('#school-next').disabled=true;steps();}
      $('#school-error').hidden=true;open(input.value);
    };
    input.onfocus=()=>open(state.school?'':input.value);
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
    state.chosenSchool=school;state.school=null;state.accessCode='';state.selections={};state.regionalChoices={};state.addedTeachers=[];state.teacherIdentifiers={};state.coordinatorDraft={};state.pathwaysReviewed=false;state.requestId=crypto.randomUUID();state.furthest=1;
    $('#school-search').value=school.schoolEsis+' - '+school.schoolName;$('#school-next').disabled=true;$('#school-content').innerHTML='';$('#school-error').hidden=true;
    if(state.config.requireAccessCode&&!school.alreadySubmitted){
      const access=$('#school-access');access.hidden=false;access.innerHTML=`<div class="notice"><strong>Enter your school access code</strong><p class="helper">Use the code provided to your school to open its details.</p><div class="field-grid">${field('access-code','School access code','',{placeholder:'Enter the school code'})}<div><button class="button primary" type="button" id="unlock-school">Open school details</button></div></div></div>`;
      $('#unlock-school').onclick=()=>{state.accessCode=$('#access-code').value.trim();loadSchool(school);};
      $('#access-code').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#unlock-school').click();}};
      $('#access-code').focus();
    } else await loadSchool(school);
  }
  async function loadSchool(school){
    const version=++schoolLoadVersion;const loading=$('#school-loading');loading.hidden=false;loading.innerHTML='<span class="spinner" aria-hidden="true"></span>Opening your school details...';
    try{
      const result=await request('/api/school?esis='+encodeURIComponent(school.schoolEsis),{headers:accessHeaders()});
      if(version!==schoolLoadVersion)return;
      if(result.alreadySubmitted){showAlreadySubmitted(result);return;}
      state.school=result;state.pathways=[...result.registeredPathways];state.coordinatorAction=result.coordinator.verified?'verified':result.coordinator.listed?'':'add';
      state.coordinatorDraft={};$('#school-access').hidden=true;$('#school-error').hidden=true;renderSchoolDetails();$('#school-next').disabled=false;
      announce('School selected. Review pathways and coordinator below.');
    }catch(error){if(version===schoolLoadVersion)showError('#school-error',error.message);}
    finally{if(version===schoolLoadVersion&&$('#school-loading'))$('#school-loading').hidden=true;}
  }
  function showAlreadySubmitted(school){
    // Discard draft personal data and disable every step after School details.
    state.school={schoolEsis:school.schoolEsis,schoolName:school.schoolName,region:school.region,alreadySubmitted:true};
    state.chosenSchool=state.school;state.step=1;state.furthest=1;state.locked=false;state.submitting=false;
    state.sentPayload=null;state.selections={};state.regionalChoices={};state.addedTeachers=[];state.teacherIdentifiers={};
    state.coordinatorDraft={};state.coordinatorAction='';state.pathways=[];state.pathwaysReviewed=false;
    const entry=state.schools.find(s=>s.schoolEsis===school.schoolEsis);if(entry)entry.alreadySubmitted=true;
    render();announce('Already submitted. Your school cannot submit another training registration request.');
  }
  function renderAlreadySubmitted(){
    const school=state.school;
    $('#school-content').innerHTML=`<section class="submitted-school" aria-labelledby="already-submitted-title" role="status"><div class="submitted-school-icon" aria-hidden="true">&#10003;</div><span class="badge pending">Request on file</span><h3 id="already-submitted-title">Already submitted</h3><p class="submitted-school-name">${esc(school.schoolName)}</p><p class="helper">School eSIS ${esc(school.schoolEsis)} &middot; ${esc(school.region)}</p><p>A training registration request has already been submitted for this school. <strong>Each school can submit only once.</strong></p><p>Requests are subject to review. Selected teachers will be notified by email.</p><p class="helper">For corrections, please contact the training team. You may close this page.</p></section>`;
    $('#school-next').disabled=true;$('#school-next').closest('.actions').hidden=true;
    $('#school-access').hidden=true;$('#school-error').hidden=true;
  }
  function pathwayOption(pathway){
    const registered=state.school.registeredPathways.includes(pathway);
    return `<label class="pathway-option"><input type="checkbox" data-pathway="${esc(pathway)}" ${state.pathways.includes(pathway)?'checked':''}><span>${esc(pathway)}</span><small>${registered?'On file':'Add pathway'}</small></label>`;
  }
  function renderSchoolDetails(){
    $('#school-next').closest('.actions').hidden=false;
    const school=state.school,c=school.coordinator;
    $('#school-content').innerHTML=`<div class="school-card"><span class="school-symbol" aria-hidden="true">&#8962;</span><div><h3>${esc(school.schoolName)}</h3><p>School eSIS ${esc(school.schoolEsis)} &middot; ${esc(school.region)}</p></div></div>
      <p class="notice once-notice"><strong>One request per school.</strong> Please include all your workshop selections before submitting. You will not be able to send a second request.</p><hr class="section-rule"><div class="section-label"><h3>Your school pathways</h3><span class="section-number">01</span></div>
      <p class="helper">${school.registeredPathways.length?'Your registered pathways are selected below. Check the list and add any others your school will participate in.':'No pathways are currently listed for your school. Select the pathways your school will participate in.'}</p>
      <div class="pathway-groups"><div><p class="group-label">Competition pathways</p>${['Literary Arts','Performing Arts'].map(pathwayOption).join('')}</div><div><p class="group-label">Participation pathways</p>${['Visual Arts','Digital Arts','Applied Arts'].map(pathwayOption).join('')}</div></div>
      <label class="check-line"><input id="pathways-reviewed" type="checkbox" ${state.pathwaysReviewed?'checked':''}><span>I have reviewed the pathways selected for this school.</span></label>
      <hr class="section-rule"><div class="section-label"><h3>School coordinator</h3><span class="section-number">02</span></div>
      ${c.listed?`<div class="coordinator-card"><div><p class="muted">Coordinator on file</p><strong>${esc(c.nameEnglish)}</strong></div><span class="badge ${c.verified?'verified':'pending'}">${c.verified?'&#10003; Verified':'Awaiting confirmation'}</span></div>`:'<p class="helper">No coordinator is currently listed. Please add your school coordinator below.</p>'}
      ${c.listed&&!c.verified?`<div class="coordinator-actions"><label class="choice-box"><input type="radio" name="coordinator-action" value="confirm" ${state.coordinatorAction==='confirm'?'checked':''}>Confirm this coordinator</label><label class="choice-box"><input type="radio" name="coordinator-action" value="change" ${state.coordinatorAction==='change'?'checked':''}>Change coordinator</label></div>`:''}
      ${c.verified?'<p class="helper">The coordinator has already been verified. No action is needed.</p>':''}<div id="coordinator-entry"></div>`;
    $$('[data-pathway]').forEach(input=>input.onchange=()=>{
      state.pathways=state.config.officialPathways.filter(p=>$$('[data-pathway]').some(n=>n.dataset.pathway===p&&n.checked));
      state.pathwaysReviewed=false;$('#pathways-reviewed').checked=false;
      if(state.school.region==='Al Dhafra'){for(const pathway of dhafraRegionalPathways){if(!state.pathways.includes(pathway)){delete state.regionalChoices[pathway];for(const session of regionalSessions(pathway))delete state.selections[session.id];}}}
      const allowed=new Set(currentSessions().map(s=>s.id));let removed=0;
      for(const id of Object.keys(state.selections)){if(!allowed.has(id)){delete state.selections[id];removed++;}}
      if(removed)toast('Selections for removed pathways were cleared.');
    });
    $('#pathways-reviewed').onchange=e=>state.pathwaysReviewed=e.target.checked;
    $$('[name="coordinator-action"]').forEach(input=>input.onchange=()=>{state.coordinatorAction=input.value;renderCoordinatorEntry();});
    renderCoordinatorEntry();
  }
  function renderCoordinatorEntry(){
    const node=$('#coordinator-entry');if(!['add','change'].includes(state.coordinatorAction)){node.innerHTML='';return;}
    const d=state.coordinatorDraft;
    const specs=[['nameEnglish','Coordinator Full Name - English'],['nameArabic','Coordinator Full Name - Arabic',{dir:'rtl'}],['esis','eSIS/PASS Number'],['position','Position/Designation'],['emiratesId','Emirates ID',{inputmode:'numeric',placeholder:'784-0000-0000000-0',help:'15 digits, starting with 784.'}],['workEmail','Work Email',{type:'email'}],['primaryEmail','Primary Email',{type:'email'}],['mobile','Contact Mobile',{type:'tel',inputmode:'tel'}]];
    node.innerHTML=`<form id="coordinator-form" class="coordinator-form"><h4>${state.coordinatorAction==='change'?'New coordinator details':'Add a school coordinator'}</h4><p class="helper">All fields are required. Contact details and identity information are kept out of the school-facing summary.</p><div class="field-grid">${specs.map(([key,label,opts])=>field(key,label,d[key],{prefix:'coord-',...opts})).join('')}</div></form>`;
    $('#coordinator-form').onsubmit=e=>e.preventDefault();
    $$('#coordinator-form input').forEach(input=>input.oninput=()=>state.coordinatorDraft[input.name]=input.value);
  }
  function showError(selector,text){const node=$(selector);if(!node)return;node.textContent=text;node.hidden=false;node.scrollIntoView({behavior:'smooth',block:'nearest'});announce(text);}
  function validSchool(){
    if(!state.school){showError('#school-error','Choose your school from the dropdown.');return false;}
    if(state.school.alreadySubmitted){showAlreadySubmitted(state.school);return false;}
    if(!state.pathwaysReviewed){showError('#school-error','Please review your school pathways and tick the acknowledgement.');$('#pathways-reviewed').focus();return false;}
    if(!state.coordinatorAction){showError('#school-error','Please confirm the listed coordinator or choose Change coordinator.');return false;}
    if(['add','change'].includes(state.coordinatorAction)){
      const form=$('#coordinator-form');if(form&&!form.reportValidity())return false;
      const eid=String(state.coordinatorDraft.emiratesId||'').replace(/[\s-]/g,'');
      if(!/^784\d{12}$/.test(eid)){showError('#school-error','Enter a 15-digit Emirates ID starting with 784.');$('#coord-emiratesId')?.focus();return false;}
      const digits=String(state.coordinatorDraft.mobile||'').replace(/\D/g,'');
      if(!/^\d{7,15}$/.test(digits)){showError('#school-error','Enter a valid coordinator contact mobile.');return false;}
    }
    if($('#school-error'))$('#school-error').hidden=true;return true;
  }
  function teacherRow(t,session){
    const selected=state.selections[session.id]===t.id,added=t.id.startsWith('A-');
    const initials=t.nameEnglish.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
    return `<div class="teacher-row"><div class="teacher-info"><span class="teacher-avatar" aria-hidden="true">${esc(initials)}</span><div><strong>${esc(t.nameEnglish)}</strong>${t.nameArabic?'<small dir="auto">'+esc(t.nameArabic)+'</small>':''}<small>${t.esis?'eSIS/PASS '+esc(t.esis):'eSIS/PASS required when selected'}${added?' &middot; Added teacher':''}</small></div></div><label class="teacher-radio"><input type="radio" name="session-${esc(session.id)}" value="${esc(t.id)}" data-select-session="${esc(session.id)}" ${selected?'checked':''}><span>${selected?'Selected for request':'Register for Training'}</span></label></div>`;
  }
  function sessionBody(s){
    const booked=state.school.bookedSessionIds.includes(s.id),selected=state.selections[s.id];
    const people=candidates(s),teacher=selected?teacherById(selected):null;
    if(booked)return '<div class="already-requested"><p>Your school already has a request for this session. Another teacher cannot be added to the same session.</p></div>';
    return `<div class="session-body">${people.length?people.map(t=>teacherRow(t,s)).join(''):'<p class="empty-session">No teacher is currently listed for this session. Add a teacher below to request a place.</p>'}
      ${teacher&&!teacher.esis?`<div class="identifier-fix"><label class="field">eSIS/PASS Number for ${esc(teacher.nameEnglish)} <input type="text" data-teacher-identifier="${esc(teacher.id)}" value="${esc(state.teacherIdentifiers[teacher.id]||'')}" placeholder="Enter the missing eSIS/PASS number" required maxlength="80"></label></div>`:''}
      ${teacher?`<div class="selected-summary"><span>Requested teacher: <strong>${esc(teacher.nameEnglish)}</strong></span><button class="button text small" type="button" data-clear-session="${esc(s.id)}">Clear</button></div>`:''}
      <button class="button session-add" type="button" data-add-session="${esc(s.id)}"><span aria-hidden="true">+</span> Register another teacher for this session</button></div>`;
  }
  function sessionCard(s){
    const booked=state.school.bookedSessionIds.includes(s.id),selected=state.selections[s.id],date=dateParts(s.date);
    return `<article class="session-card ${selected?'has-selection':''}" id="card-${esc(s.id)}"><div class="session-header"><div class="session-title"><div class="date-tile" aria-hidden="true"><strong>${date.day}</strong><small>${date.month}</small></div><div><h3>${esc(s.pathway)}</h3><div class="session-meta"><span>${esc(s.region)}</span><span aria-hidden="true">&middot;</span><span>${esc(s.time)}</span></div><div class="session-date-full">${esc(dateFull(s.date))}</div></div></div><span class="badge ${selected?'selected':booked?'pending':''}">${booked?'Already requested':selected?'1 teacher selected':'Choose 1 teacher'}</span></div>${sessionBody(s)}</article>`;
  }
  function pathwayId(pathway){return pathway.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
  function dhafraPathwayCard(pathway){
    const options=regionalSessions(pathway),chosenRegion=state.regionalChoices[pathway]||'',session=options.find(s=>s.region===chosenRegion),selected=session&&state.selections[session.id];
    const optionHtml=options.map(s=>`<label class="region-option"><input type="radio" name="region-${esc(pathwayId(pathway))}" data-region-pathway="${esc(pathway)}" value="${esc(s.region)}" ${chosenRegion===s.region?'checked':''}><span><strong>${esc(s.region)}</strong><small>${esc(dateFull(s.date))}</small><small>${esc(s.time)}</small></span></label>`).join('');
    return `<article class="session-card regional-pathway-card ${selected?'has-selection':''}" id="pathway-card-${esc(pathwayId(pathway))}"><div class="session-header"><div><h3>${esc(pathway)}</h3><div class="session-meta">${session?`<span>${esc(session.region)}</span><span aria-hidden="true">&middot;</span><span>${esc(session.time)}</span>`:'<span>Choose Abu Dhabi or Al Ain</span>'}</div>${session?`<div class="session-date-full">${esc(dateFull(session.date))}</div>`:''}</div><span class="badge ${selected?'selected':''}">${selected?'1 teacher selected':session?'Choose 1 teacher':'Choose region'}</span></div>
      <div class="region-choice"><p><strong>Choose one training region for this pathway.</strong> Your school can request either Abu Dhabi or Al Ain, not both.</p><div class="region-options">${optionHtml}</div></div>
      ${session?sessionBody(session):'<div class="region-waiting">Select a region above to see the teachers available for this pathway.</div>'}</article>`;
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
    main.innerHTML=`<div class="session-top"><div><p class="eyebrow">STEP 02</p><h2>Training registration</h2></div><p class="school-context">${esc(state.school.schoolName)} &middot; ${esc(state.school.region)}</p></div>
      <div class="notice"><strong>One teacher per school, per pathway session.</strong> Select one teacher for each workshop you wish to request. The same teacher may be selected for different sessions.</div>
      ${state.school.region==='Al Dhafra'?'<div class="notice dhafra-note"><strong>Al Dhafra schools:</strong> For Literary Arts, Digital Arts and Visual Arts, choose <strong>one</strong> training region first — Abu Dhabi or Al Ain. You cannot request both regional sessions for the same pathway.</div>':''}
      <div id="session-list">${sessionMarkup()}</div><p id="sessions-error" class="form-error" role="alert" hidden></p>
      <div class="sticky-actions"><button class="button secondary" id="sessions-back" type="button"><span aria-hidden="true">&#8592;</span><span class="back-label"> School details</span></button><div class="count" id="selection-count"></div><button class="button primary" id="sessions-next" type="button">Review requests <span aria-hidden="true">&#8594;</span></button></div>`;
    bindSessionEvents();updateCounter();
    $('#sessions-back').onclick=()=>{state.step=1;render();};
    $('#sessions-next').onclick=()=>{if(validSessions()){state.step=3;state.furthest=3;render();}};
  }
  function bindSessionEvents(){
    $$('[data-region-pathway]').forEach(input=>input.onchange=()=>{
      const pathway=input.dataset.regionPathway,oldRegion=state.regionalChoices[pathway];
      for(const session of regionalSessions(pathway))delete state.selections[session.id];
      state.regionalChoices[pathway]=input.value;
      refreshPathway(pathway);updateCounter();
      announce(pathway+' training region set to '+input.value+'. Choose one teacher for this pathway session.');
      if(oldRegion&&oldRegion!==input.value)toast('Region changed to '+input.value+'. The previous teacher selection for '+pathway+' was cleared.');
    });
    $$('[data-select-session]').forEach(input=>input.onchange=()=>{
      const sid=input.dataset.selectSession;state.selections[sid]=input.value;
      refreshSession(sid);updateCounter();announce('Teacher selected for '+getSession(sid).pathway+'. Only one teacher is selected for this session.');
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
  function updateCounter(){
    const count=selectedEntries().length;$('#selection-count').innerHTML=`<strong>${count}</strong> session request${count===1?'':'s'}`;
    $('#sessions-next').disabled=count===0;
  }
  function validSessions(){
    if(state.school?.alreadySubmitted){showAlreadySubmitted(state.school);return false;}
    if(!selectedEntries().length){showError('#sessions-error','Select a teacher for at least one session.');return false;}
    for(const {teacher} of selectedEntries()){
      if(!teacher.esis&&!String(state.teacherIdentifiers[teacher.id]||'').trim()){
        showError('#sessions-error','Enter the missing eSIS/PASS number for '+teacher.nameEnglish+'.');
        $$('[data-teacher-identifier]').find(i=>i.dataset.teacherIdentifier===teacher.id)?.focus();return false;
      }
    }
    return true;
  }
  function openTeacherDialog(sessionId){
    activeSession=sessionId;const s=getSession(sessionId);
    $('#dialog-context').textContent=s.pathway+' - '+s.region+' - '+dateFull(s.date);
    const specs=[['nameEnglish','Teacher Full Name - English'],['nameArabic','Teacher Full Name - Arabic',{dir:'rtl'}],['esis','eSIS/PASS Number'],['position','Position/Designation'],['workEmail','Work Email',{type:'email'}],['mobile','Contact Mobile',{type:'tel',inputmode:'tel'}]];
    $('#teacher-fields').innerHTML=specs.map(([k,label,opts])=>field(k,label,'',{prefix:'teacher-',...opts})).join('');
    $('#teacher-error').hidden=true;$('#teacher-dialog').showModal();$('#teacher-nameEnglish').focus();
  }
  $('#close-dialog').onclick=$('#cancel-teacher').onclick=()=>$('#teacher-dialog').close();
  $('#teacher-dialog').addEventListener('click',e=>{if(e.target===$('#teacher-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  $('#teacher-form').onsubmit=e=>{
    e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
    const t=Object.fromEntries(new FormData(form));for(const key of Object.keys(t))t[key]=String(t[key]).trim();t.esis=ident(t.esis);
    if(!/^\d{7,15}$/.test(t.mobile.replace(/\D/g,''))){showError('#teacher-error','Please enter a valid contact mobile.');return;}
    const known=state.school.teachers.find(r=>r.esis&&ident(r.esis)===t.esis);
    if(known&&norm(known.nameEnglish)!==norm(t.nameEnglish)){showError('#teacher-error','This eSIS/PASS number belongs to '+known.nameEnglish+'. Please use the listed teacher or correct the number.');return;}
    const session=getSession(activeSession);
    if(known && session.pathway!=='Oral History' && known.pathways.includes('Applied Arts') && !known.pathways.includes(session.pathway)){showError('#teacher-error','This listed teacher is not eligible for this workshop. Please choose a different teacher.');return;}
    let added=state.addedTeachers.find(a=>ident(a.esis)===t.esis);
    if(added)Object.assign(added,t);else{added={...t,id:'A-'+crypto.randomUUID(),pathways:known?.pathways||[]};state.addedTeachers.push(added);}
    state.selections[activeSession]=known&&(session.pathway==='Oral History'||known.pathways.includes(session.pathway))?known.id:added.id;
    $('#teacher-dialog').close();renderSessions();
    const card=document.getElementById('card-'+activeSession);card.scrollIntoView({behavior:'smooth',block:'center'});
    toast(t.nameEnglish+' is selected for this session.');
  };
  function reviewRows(){return selectedEntries().map(({session:s,teacher:t})=>`<div class="review-session"><div><strong>${esc(s.pathway)}</strong><small>${esc(dateFull(s.date))}</small><small>${esc(s.region)} &middot; ${esc(s.time)}</small></div><div class="review-person"><strong>${esc(t.nameEnglish)}</strong>${t.nameArabic?'<small dir="auto">'+esc(t.nameArabic)+'</small>':''}<small>eSIS/PASS ${esc(t.esis||state.teacherIdentifiers[t.id])}</small></div></div>`).join('');}
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
      if(idA&&idA===idB&&ra&&rb&&Math.max(ra[0],rb[0])<Math.min(ra[1],rb[1]))out.push(a.teacher.nameEnglish+' has overlapping '+a.session.pathway+' and '+b.session.pathway+' requests on '+dateFull(a.session.date)+'.');
    }
    return out;
  }
  function renderReview(){
    const entries=selectedEntries(),warnings=conflicts(),canSubmit=state.config.storageConfigured&&!state.config.previewOnly;
    main.innerHTML=`<section class="panel"><div class="panel-heading"><div><p class="eyebrow">STEP 03</p><h2>Review your requests</h2><p class="muted">Check each name and session before sending them for review. This is your school’s only submission: include all sessions now.</p></div><span class="badge pending">Not yet submitted</span></div>
      <div class="review-school"><div><h3>${esc(state.school.schoolName)}</h3><p class="helper">School eSIS ${esc(state.school.schoolEsis)} &middot; ${esc(state.school.region)}</p></div><button class="button text small" data-edit="1" type="button" ${state.locked?'disabled':''}>Edit school details</button></div>
      <dl class="review-details"><div><dt>School coordinator</dt><dd><strong>${esc(coordinatorName())}</strong><br>${esc(coordinatorStatus())}</dd></div><div><dt>School pathways reviewed</dt><dd>${state.pathways.length?state.pathways.map(esc).join(', '):'No school pathways selected'}</dd></div></dl></section>
      <section class="panel"><div class="section-label"><h3>${entries.length} session request${entries.length===1?'':'s'}</h3><button class="button text small" data-edit="2" type="button" ${state.locked?'disabled':''}>Edit selections</button></div>${reviewRows()}</section>
      ${warnings.length?'<div class="notice warning"><strong>Please review the timing</strong>'+warnings.map(w=>'<p>'+esc(w)+'</p>').join('')+'</div>':''}
      <section class="panel"><h3>What happens next?</h3><p class="helper">We will review your school\u2019s requests and email the selected teachers later. Submitting this form does not confirm a place at any workshop.</p><label class="check-line"><input id="request-ack" type="checkbox" ${state.sentPayload?'checked disabled':''}><span><strong>I have included all workshop requests for my school and checked the details.</strong>I understand that my school can submit only once and attendance is subject to review and a later email.</span></label><p id="submit-error" class="form-error" role="alert" hidden></p>
      ${!canSubmit?'<p class="notice warning">Submission is not enabled yet. The administrator must finish the request-storage setup. No request has been sent.</p>':''}
      <div class="actions"><button class="button secondary" data-edit="2" type="button" ${state.locked?'disabled':''}>&#8592; Back</button><button class="button primary" id="submit-request" type="button" ${!canSubmit?'disabled':''}>${state.locked?'Retry the same request':'Submit registration request'} <span aria-hidden="true">&#8594;</span></button></div></section>`;
    $$('[data-edit]').forEach(button=>button.onclick=()=>{state.step=Number(button.dataset.edit);render();});
    $('#submit-request').onclick=submit;
  }
  function payload(){
    const selected=selectedEntries().map(({session,teacher})=>({sessionId:session.id,teacherId:teacher.id}));
    return {requestId:state.requestId,schoolEsis:state.school.schoolEsis,pathways:[...state.pathways],pathwaysReviewed:state.pathwaysReviewed,
      coordinator:{action:state.coordinatorAction,...(['add','change'].includes(state.coordinatorAction)?state.coordinatorDraft:{})},
      selections:selected,addedTeachers:state.addedTeachers.filter(t=>selected.some(s=>s.teacherId===t.id)),teacherIdentifiers:state.teacherIdentifiers,acknowledgement:true};
  }
  async function submit(){
    if(state.submitting||state.receipt)return;
    if(state.school?.alreadySubmitted){showAlreadySubmitted(state.school);return;}
    if(!$('#request-ack').checked){showError('#submit-error','Please acknowledge that these are requests, not confirmed places.');$('#request-ack').focus();return;}
    state.sentPayload=state.sentPayload||structuredClone(payload());state.submitting=true;state.locked=true;steps();
    $$('[data-edit]').forEach(b=>b.disabled=true);$('#submit-request').disabled=true;$('#submit-request').innerHTML='<span class="spinner" aria-hidden="true"></span>Sending your request...';$('#submit-error').hidden=true;
    try{
      const result=await request('/api/register',{method:'POST',headers:accessHeaders(),body:JSON.stringify(state.sentPayload)});
      state.receipt=result;state.step=4;state.submitting=false;render();announce('Your request was received and is pending review.');
      // No coordinator identity/contact information is kept in browser storage.
      state.coordinatorDraft={nameEnglish:coordinatorName()};state.sentPayload=null;
    }catch(error){
      state.submitting=false;
      if(error.code==='SCHOOL_ALREADY_SUBMITTED'){
        showAlreadySubmitted(state.school);return;
      }
      if(error.status===400 || (error.status===409&&['SCHOOL_SESSION_TAKEN','DUPLICATE_RECORD'].includes(error.code))){state.locked=false;state.sentPayload=null;}
      renderReview();steps();showError('#submit-error',error.message+(state.locked?' You can retry this same request without changing the details.':''));
    }
  }
  function renderSuccess(){
    main.innerHTML=`<section class="panel success-panel"><div class="success-icon" aria-hidden="true">&#10003;</div><span class="badge pending">Pending review</span><h2>Your request has been received</h2><p>Thank you, ${esc(state.school.schoolName)}.</p><p>We will review your school\u2019s workshop requests and email the selected teachers later. <strong>Attendance is not confirmed yet.</strong></p><div class="receipt">${state.receipt.requestCount} session request${state.receipt.requestCount===1?'':'s'} received<br><strong>Request reference</strong><code>${esc(state.receipt.requestId)}</code></div><button class="button secondary" id="print-request" type="button">Print or save your request summary</button><p class="helper">Your school has now used its single submission. For corrections, please contact the training team. You may close this page.</p></section><section class="panel"><h3>Requested sessions</h3>${reviewRows()}</section>`;
    $('#print-request').onclick=()=>window.print();
  }
  async function start(){
    main.innerHTML='<div class="panel loading"><span class="spinner" aria-hidden="true"></span>Opening training registration...</div>';
    try{
      const [schools,config]=await Promise.all([request('/api/schools'),request('/api/config')]);state.schools=schools;state.config=config;
      if(!config.storageConfigured||config.previewOnly){const note=$('#setup-note');note.hidden=false;note.textContent=config.previewOnly?'Local interface preview: no requests will be submitted.':'Administrator setup required: request storage is not connected. You can review the interface, but submission is disabled.';}
      render(false);
    }catch(error){main.innerHTML='<section class="panel"><h2>We could not open registration</h2><p>'+esc(error.message)+'</p><button class="button primary" id="reload-page" type="button">Try again</button></section>';$('#reload-page').onclick=()=>location.reload();}
  }
  window.addEventListener('beforeunload',event=>{if(state.locked&&!state.receipt){event.preventDefault();event.returnValue='';}});
  start();
})();
