-- v2.1: new installation, or safe upgrade of existing v2 tables.
begin;
-- Run once in Supabase SQL Editor, in a dedicated project or schema installation.
-- No teacher or coordinator data is included in this SQL file.
-- Public/anonymous database access is explicitly disabled.

create table if not exists public.nae_school_requests (
  id uuid primary key,
  school_esis text not null,
  payload_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.nae_training_requests (
  id text primary key,
  school_request_id uuid not null references public.nae_school_requests(id),
  school_esis text not null,
  session_id text not null,
  record jsonb not null,
  request_status text not null default 'Pending review'
    check (request_status in ('Pending review','Approved','Not selected','Withdrawn')),
  sync_state text not null default 'pending'
    check (sync_state in ('pending','sending','synced','needs_review')),
  jotform_submission_id text,
  sync_started_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now(),
  constraint nae_one_teacher_per_school_session unique (school_esis,session_id)
);
create index if not exists nae_sync_pending_idx on public.nae_training_requests(sync_state,created_at);
alter table public.nae_school_requests enable row level security;
alter table public.nae_training_requests enable row level security;
revoke all on public.nae_school_requests,public.nae_training_requests from public,anon,authenticated;
grant usage on schema public to service_role;
grant select,insert,update,delete on public.nae_school_requests,public.nae_training_requests to service_role;

-- One durable lock per school for the entire training registration form.
-- A separate table preserves older request history, even if a school had
-- several accepted batches before this policy was enabled.
-- Lock writes are blocked on the request table while history is backfilled.
lock table public.nae_school_requests in share row exclusive mode;
create table if not exists public.nae_school_submission_locks (
  school_esis text primary key,
  school_request_id uuid not null references public.nae_school_requests(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  constraint nae_school_lock_canonical check (school_esis = upper(btrim(school_esis)))
);
alter table public.nae_school_submission_locks enable row level security;
revoke all on public.nae_school_submission_locks from public,anon,authenticated,service_role;
grant select,insert on public.nae_school_submission_locks to service_role;

-- Existing school requests count as submitted, including requests awaiting
-- Jotform synchronization. No historical request or teacher data is deleted.
insert into public.nae_school_submission_locks(school_esis,school_request_id,submitted_at)
select distinct on (upper(btrim(school_esis))) upper(btrim(school_esis)),id,created_at
from public.nae_school_requests
order by upper(btrim(school_esis)),created_at,id
on conflict (school_esis) do nothing;

-- Runs for every insert, including inserts using an older portal version.
-- The primary key is the cross-browser/device/concurrent-submission barrier.
-- This trigger and ALL session rows are in the same transaction: a failed
-- request rolls back its school lock as well, allowing a safe retry.
create or replace function public.nae_lock_school_submission()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  begin
    insert into public.nae_school_submission_locks(school_esis,school_request_id,submitted_at)
    values(upper(btrim(new.school_esis)),new.id,new.created_at);
  exception when unique_violation then
    raise exception 'SCHOOL_ALREADY_SUBMITTED' using errcode='P0001';
  end;
  return new;
end;
$$;
revoke all on function public.nae_lock_school_submission() from public,anon,authenticated;
grant execute on function public.nae_lock_school_submission() to service_role;
drop trigger if exists nae_one_submission_per_school on public.nae_school_requests;
create trigger nae_one_submission_per_school
  after insert on public.nae_school_requests
  for each row execute function public.nae_lock_school_submission();

-- Atomic whole-school submission with idempotent retries.
-- Replaying the SAME ID + payload returns the existing receipt. A fresh ID
-- for a school that already submitted is rejected, even for different sessions.
create or replace function public.nae_submit_request(p_id uuid,p_school text,p_hash text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  existing public.nae_school_requests%rowtype;
  item jsonb;
  v_constraint text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into existing from public.nae_school_requests where id=p_id;
  if found then
    if existing.school_esis<>p_school or existing.payload_hash<>p_hash then
      raise exception 'IDEMPOTENCY_MISMATCH' using errcode='P0001';
    end if;
    return jsonb_build_object('requestId',p_id,'created',false,'count',jsonb_array_length(existing.payload->'records'));
  end if;
  if p_school is null or p_hash is null or p_payload->>'schoolEsis' is distinct from p_school
      or jsonb_typeof(p_payload->'records') is distinct from 'array'
      or jsonb_array_length(p_payload->'records') not between 1 and 9 then
    raise exception 'INVALID_REQUEST' using errcode='P0001';
  end if;
  if exists(select 1 from public.nae_school_submission_locks where school_esis=upper(btrim(p_school))) then
    raise exception 'SCHOOL_ALREADY_SUBMITTED' using errcode='P0001';
  end if;
  insert into public.nae_school_requests(id,school_esis,payload_hash,payload) values(p_id,p_school,p_hash,p_payload);
  for item in select value from jsonb_array_elements(p_payload->'records') loop
    insert into public.nae_training_requests(id,school_request_id,school_esis,session_id,record)
    values(item->>'id',p_id,p_school,item->>'sessionId',item);
  end loop;
  return jsonb_build_object('requestId',p_id,'created',true,'count',jsonb_array_length(p_payload->'records'));
exception when unique_violation then
  get stacked diagnostics v_constraint=constraint_name;
  if v_constraint='nae_one_teacher_per_school_session' then
    raise exception 'SCHOOL_SESSION_TAKEN' using errcode='P0001';
  end if;
  raise;
end;
$$;
revoke all on function public.nae_submit_request(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nae_submit_request(uuid,text,text,jsonb) to service_role;

-- Atomic outbox claiming prevents parallel workers from creating the same
-- Jotform record. An uncertain POST is held for human reconciliation, not retried.
create or replace function public.nae_claim_sync(p_batch uuid default null,p_limit integer default 9)
returns setof public.nae_training_requests language plpgsql security invoker set search_path = '' as $$
begin
  return query
    update public.nae_training_requests t
    set sync_state='sending',sync_started_at=now(),sync_error=null
    where t.id in (
      select q.id from public.nae_training_requests q
      where q.sync_state='pending' and (p_batch is null or q.school_request_id=p_batch)
      order by q.created_at,q.id for update skip locked limit least(greatest(p_limit,1),20)
    ) returning t.*;
end;
$$;
revoke all on function public.nae_claim_sync(uuid,integer) from public,anon,authenticated;
grant execute on function public.nae_claim_sync(uuid,integer) to service_role;

-- Read this view only as an administrator. It deliberately excludes contacts
-- and Emirates ID. Full authorized records remain in the protected tables.
create or replace view public.nae_sync_monitor with (security_invoker=true) as
  select id,school_esis,session_id,request_status,sync_state,jotform_submission_id,created_at,sync_error
  from public.nae_training_requests;
revoke all on public.nae_sync_monitor from public,anon,authenticated;
grant select on public.nae_sync_monitor to service_role;

commit;
