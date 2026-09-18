-- v2.1 launch check: run AFTER setup.sql or the v2.1 upgrade migration.
-- Uses synthetic school identifiers only. ALL data is rolled back.
-- Expected: PASS notice; no real school is locked by this test.
begin;
do $$
declare
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  d uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); f uuid:=gen_random_uuid();
  school text:='NAE-SMOKE-'||gen_random_uuid()::text;
  school2 text:='NAE-SMOKE-OTHER-'||gen_random_uuid()::text;
  school3 text:='NAE-SMOKE-ROLLBACK-'||gen_random_uuid()::text;
  result jsonb; p jsonb; caught boolean;
begin
  p:=jsonb_build_object('schoolEsis',school,'records',jsonb_build_array(
    jsonb_build_object('id','SMOKE-'||a::text,'sessionId','SMOKE-SESSION-A')
  ));
  result:=public.nae_submit_request(a,school,'hash-a',p);
  assert (result->>'created')::boolean, 'First request must be saved';
  assert exists(select 1 from public.nae_school_submission_locks where school_esis=upper(school)), 'School must now be marked submitted';
  result:=public.nae_submit_request(a,school,'hash-a',p);
  assert not (result->>'created')::boolean, 'Identical retry returns existing receipt';
  assert (select count(*) from public.nae_school_requests where school_esis=school)=1, 'Retry must not create a second request';

  caught:=false;
  begin
    perform public.nae_submit_request(a,school,'different-hash',p);
  exception when raise_exception then
    if sqlerrm='IDEMPOTENCY_MISMATCH' then caught:=true; else raise; end if;
  end;
  assert caught, 'Altered replay must be rejected';

  -- A completely different session is STILL a second school submission.
  p:=jsonb_build_object('schoolEsis',school,'records',jsonb_build_array(
    jsonb_build_object('id','SMOKE-'||b::text,'sessionId','SMOKE-SESSION-B')
  ));
  caught:=false;
  begin
    perform public.nae_submit_request(b,school,'hash-b',p);
  exception when raise_exception then
    if sqlerrm='SCHOOL_ALREADY_SUBMITTED' then caught:=true; else raise; end if;
  end;
  assert caught, 'Same school cannot submit again for DIFFERENT sessions';
  assert not exists(select 1 from public.nae_school_requests where id=b), 'Rejected request header must not persist';
  assert not exists(select 1 from public.nae_training_requests where school_request_id=b), 'Rejected request must create no session records';

  -- The table trigger also protects inserts made through an older API function.
  caught:=false;
  begin
    insert into public.nae_school_requests(id,school_esis,payload_hash,payload) values(c,school,'hash-c',p);
  exception when raise_exception then
    if sqlerrm='SCHOOL_ALREADY_SUBMITTED' then caught:=true; else raise; end if;
  end;
  assert caught, 'Direct second request-header insert must be rejected';

  -- Another school can still request the same session.
  p:=jsonb_build_object('schoolEsis',school2,'records',jsonb_build_array(
    jsonb_build_object('id','SMOKE-'||d::text,'sessionId','SMOKE-SESSION-A')
  ));
  perform public.nae_submit_request(d,school2,'hash-d',p);
  assert exists(select 1 from public.nae_school_requests where id=d), 'Different school remains eligible';

  -- An invalid first request must NOT use up the school submission.
  p:=jsonb_build_object('schoolEsis',school3,'records',jsonb_build_array(
    jsonb_build_object('id','SMOKE-FAIL-1-'||e::text,'sessionId','SMOKE-SAME-SESSION'),
    jsonb_build_object('id','SMOKE-FAIL-2-'||e::text,'sessionId','SMOKE-SAME-SESSION')
  ));
  caught:=false;
  begin
    perform public.nae_submit_request(e,school3,'hash-e',p);
  exception when raise_exception then
    if sqlerrm='SCHOOL_SESSION_TAKEN' then caught:=true; else raise; end if;
  end;
  assert caught, 'Two teachers for the same session remain disallowed';
  assert not exists(select 1 from public.nae_school_requests where id=e), 'Failed first batch must roll back';
  assert not exists(select 1 from public.nae_school_submission_locks where school_esis=upper(school3)), 'Failed first batch must not leave a school lock';
  assert not exists(select 1 from public.nae_training_requests where school_request_id=e), 'No partial records';
  p:=jsonb_build_object('schoolEsis',school3,'records',jsonb_build_array(
    jsonb_build_object('id','SMOKE-'||f::text,'sessionId','SMOKE-SAME-SESSION')
  ));
  perform public.nae_submit_request(f,school3,'hash-f',p);
  assert exists(select 1 from public.nae_school_submission_locks where school_esis=upper(school3)), 'Corrected first request may submit';

  -- Review decisions do not reopen a school's form.
  update public.nae_training_requests set request_status='Withdrawn' where school_request_id=a;
  assert exists(select 1 from public.nae_school_submission_locks where school_esis=upper(school)), 'Withdrawn requests keep the school lock';
  raise notice 'PASS: one school submission, same-ID retries, rollback, direct-insert guard, and one teacher per session.';
end $$;
rollback;
