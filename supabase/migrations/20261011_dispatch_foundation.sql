-- M Express dispatch foundation (run manually in a new Supabase project)
create extension if not exists pgcrypto;
DO $
BEGIN
  create type public.trip_status as enum ('pending','assigned','on_the_way','arrived','boarded','completed','cancelled');
exception when duplicate_object then
  null;
END $;
create table public.driver_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check (username ~ '^[a-zA-Z0-9._-]{3,40}$'),
 display_name text not null,
 role text not null default 'driver' check (role in ('driver','admin')),
 created_at timestamptz not null default now()
);
create table public.trips (
 id uuid primary key default gen_random_uuid(),
 passenger_name text not null,
 passenger_phone text not null,
 passenger_email text,
 pickup_address text not null,
 dropoff_address text not null,
 pickup_at timestamptz not null,
 wheelchair_required boolean,
 trip_type text not null default 'one_way' check (trip_type in ('one_way','round_trip','wait_and_return')),
 notes text,
 price_cents integer check (price_cents >= 0),
 assigned_driver_id uuid references public.driver_profiles(id),
 status public.trip_status not null default 'pending',
 source text not null default 'website' check (source in ('website','dispatch')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.trip_status_events (
 id bigint generated always as identity primary key,
 trip_id uuid not null references public.trips(id) on delete cascade,
 actor_id uuid references auth.users(id),
 status public.trip_status not null,
 created_at timestamptz not null default now()
);
create index trips_driver_pickup_idx on public.trips (assigned_driver_id,pickup_at);
create index trips_status_idx on public.trips (status);
alter table public.driver_profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_status_events enable row level security;
create function public.is_dispatch_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.driver_profiles where id = auth.uid() and role = 'admin')
$$;
create policy profiles_self_or_admin_select on public.driver_profiles for select to authenticated using (id = auth.uid() or public.is_dispatch_admin());
create policy profiles_admin_write on public.driver_profiles for all to authenticated using (public.is_dispatch_admin()) with check (public.is_dispatch_admin());
create policy trips_admin_all on public.trips for all to authenticated using (public.is_dispatch_admin()) with check (public.is_dispatch_admin());
create policy trips_driver_read on public.trips for select to authenticated using (assigned_driver_id = auth.uid());
create policy events_admin_read on public.trip_status_events for select to authenticated using (public.is_dispatch_admin());
create policy events_driver_read on public.trip_status_events for select to authenticated using (exists(select 1 from public.trips where trips.id = trip_id and trips.assigned_driver_id = auth.uid()));
-- Driver status changes must go through a validated server endpoint/RPC, not direct table UPDATE.
-- Website intake must go through a rate-limited Cloudflare Function with server-only credentials.
