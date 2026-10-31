-- REVIEW ONLY: shared database migration; separate approval required.
-- Every UPDATE must advance the revision, including direct staff PostgREST writes.
-- RLS and existing UPDATE permissions are unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.dispatch_advance_trip_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.updated_at := GREATEST(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_advance_trip_revision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER dispatch_trip_revision_before_update
BEFORE UPDATE ON public.trips FOR EACH ROW
EXECUTE FUNCTION public.dispatch_advance_trip_revision();
COMMIT;
