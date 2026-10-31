-- REVIEW ONLY. Deploy compatible scoped RPC reads before applying to a shared DB.
-- Keeps existing RLS policies. No data changes; server service_role privileges remain.
BEGIN;
REVOKE ALL PRIVILEGES ON TABLE public.trips FROM PUBLIC, anon, authenticated;
-- Table-level revocation does not remove pre-existing column grants.
DO $$
DECLARE columns_sql text;
BEGIN
 SELECT string_agg(quote_ident(attname), ', ') INTO columns_sql
 FROM pg_attribute WHERE attrelid='public.trips'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.trips FROM PUBLIC, anon, authenticated', columns_sql);
END $$;
-- Explicit allowlist: never expose new columns automatically.
GRANT SELECT (id, passenger_name, passenger_phone, pickup_address, dropoff_address,
 pickup_at, wheelchair_required, trip_type, notes, assigned_driver_id, status,
 created_at, updated_at, archived_at, dropoff_at, distance_miles)
ON TABLE public.trips TO authenticated;
-- Full staff reads use existing dispatch_get_trips() with active staff authorization.
-- Writes use the role-checked Worker or existing assigned-driver status RPC.
COMMIT;
