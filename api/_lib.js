const data = require('../data/registration-data.json');

const allowedPathways = ['Oral History','Literary Arts','Digital Arts','Performing Arts','Visual Arts'];

function getSchool(esis) {
  return data.schools.find(s => String(s.schoolEsis).toLowerCase() === String(esis || '').trim().toLowerCase());
}

function getSessions(pathway) {
  return data.sessions.filter(s => s.pathway === pathway);
}

function expectedSessions(pathway, schoolRegion, requestedRegion) {
  if (!allowedPathways.includes(pathway)) return [];
  const candidates = getSessions(pathway);
  if (pathway === 'Oral History') return candidates.filter(s => s.region === 'Abu Dhabi');
  if (pathway === 'Performing Arts') return candidates.filter(s => s.region === 'Abu Dhabi');
  let region = schoolRegion;
  if (schoolRegion === 'Al Dhafra') region = requestedRegion;
  if (!['Abu Dhabi','Al Ain'].includes(region)) return [];
  return candidates.filter(s => s.region === region);
}

function cleanText(v, max=500) {
  return String(v ?? '').trim().slice(0,max);
}

async function jotformQuestions() {
  const key = process.env.JOTFORM_API_KEY;
  const formId = process.env.JOTFORM_FORM_ID;
  if (!key || !formId) throw new Error('Jotform environment variables are not configured.');
  const r = await fetch(`https://api.jotform.com/form/${encodeURIComponent(formId)}/questions`, {headers:{APIKEY:key}});
  const body = await r.json();
  if (!r.ok || body.responseCode && body.responseCode >= 400) throw new Error(body.message || 'Unable to read Jotform questions.');
  return body.content || {};
}

function findQuestion(questions, text) {
  const target = text.trim().toLowerCase();
  for (const [qid,q] of Object.entries(questions)) {
    if (String(q.text || '').trim().toLowerCase() === target) return {qid, ...q};
  }
  return null;
}

function appendAnswer(params, q, value) {
  if (!q || value === undefined || value === null || value === '') return;
  const key = `submission[${q.qid}]`;
  if (q.type === 'control_datetime') {
    const d = new Date(`${value}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      params.append(`${key}[month]`, String(d.getUTCMonth()+1).padStart(2,'0'));
      params.append(`${key}[day]`, String(d.getUTCDate()).padStart(2,'0'));
      params.append(`${key}[year]`, String(d.getUTCFullYear()));
      return;
    }
  }
  if (q.type === 'control_checkbox') {
    params.append(`${key}[]`, String(value));
    return;
  }
  params.append(key, String(value));
}

async function submitJotformRecord(record) {
  const key = process.env.JOTFORM_API_KEY;
  const formId = process.env.JOTFORM_FORM_ID;
  const questions = await jotformQuestions();
  const answers = {
    'School ESIS': record.schoolEsis,
    'School Name': record.schoolName,
    'School Region': record.schoolRegion,
    'School Contact Name': record.contactName,
    'School Contact Email': record.contactEmail,
    'School Contact Phone': record.contactPhone,
    'Teacher eSIS': record.teacherEsis,
    'Teacher Name': record.teacherName,
    'Teacher Email': record.teacherEmail,
    'Teacher Phone': record.teacherPhone,
    'Registration Type': record.registrationType,
    'Original Nomination Pathway': record.originalNominationPathway,
    'Registration Pathway': record.pathway,
    'Training Region': record.trainingRegion,
    'Session Date': record.sessionDate,
    'Venue': record.venue,
    'Session Time': record.sessionTime,
    'Attendance Confirmed': 'Confirmed — this teacher will attend this session',
    'Portal Registration ID': record.portalRegistrationId,
    'School Submission ID': record.schoolSubmissionId,
    'Record Source': 'Hybrid Portal',
    'Notes': record.notes || ''
  };
  const params = new URLSearchParams();
  const missing=[];
  for (const [label,val] of Object.entries(answers)) {
    const q=findQuestion(questions,label);
    if (!q) { missing.push(label); continue; }
    appendAnswer(params,q,val);
  }
  if (missing.length) throw new Error(`Jotform field mapping missing: ${missing.join(', ')}`);
  const r=await fetch(`https://api.jotform.com/form/${encodeURIComponent(formId)}/submissions`, {method:'POST',headers:{APIKEY:key,'Content-Type':'application/x-www-form-urlencoded'},body:params});
  const body=await r.json();
  if (!r.ok || body.responseCode && body.responseCode >= 400) throw new Error(body.message || 'Jotform submission failed.');
  return body.content || body;
}

module.exports={data,getSchool,getSessions,expectedSessions,cleanText,submitJotformRecord};
