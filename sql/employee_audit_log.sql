-- Run once in Supabase SQL Editor for M Express test dispatch.
create table if not exists public.employee_audit_log (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 actor_id uuid not null references auth.users(id),
 actor_role text not null,
 action text not null,
 target_id uuid not null references auth.users(id),
 details jsonb not null default '{}'::jsonb
);
create index if not exists employee_audit_log_created_at_idx on public.employee_audit_log(created_at desc);
alter table public.employee_audit_log enable row level security;
revoke all on public.employee_audit_log from anon, authenticated;
-- Cloudflare Worker service-role credential alone writes and reads this table.
