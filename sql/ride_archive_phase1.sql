-- M Express Dispatch TEST ONLY. Run in the TEST Supabase project SQL Editor.
-- Archive state is separate from trip status; existing rides remain active.
alter table public.trips add column if not exists archived_at timestamptz;
alter table public.trips add column if not exists archive_source text;
create index if not exists trips_archived_at_idx on public.trips (archived_at);
create index if not exists trips_archive_search_idx on public.trips (status, pickup_at, assigned_driver_id);
-- Server-side automatic archive. Boston-local midnight is derived using AT TIME ZONE.
-- A trip is eligible only after the Boston calendar day of pickup has ended.
create or replace function public.archive_finished_rides()
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
 update public.trips
 set archived_at=now(),archive_source='automatic'
 where archived_at is null
   and status in ('completed','cancelled')
   and (pickup_at at time zone 'America/New_York')::date
       < (now() at time zone 'America/New_York')::date;
 get diagnostics affected = row_count;
 return affected;
end; $$;
revoke all on function public.archive_finished_rides() from public, anon, authenticated;
-- Scheduling requires pg_cron enabled in Supabase Database Extensions.
-- Run the following separately ONLY after confirming pg_cron is available:
-- select cron.schedule('mexpress-archive-finished', '* * * * *',
--   'select public.archive_finished_rides();');
-- Running every minute makes archiving occur shortly after midnight in Boston,
-- including daylight saving time changes.
