alter table rides add column if not exists ai_lease_until timestamptz;
alter table rides add column if not exists ai_job_token uuid;
create index if not exists rides_pending_ai_idx on rides(ai_lease_until, created_at)
  where ai_status = 'pending';
