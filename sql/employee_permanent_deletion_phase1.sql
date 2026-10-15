-- M Express TEST dispatch: Phase 1 of permanent employee account deletion.
-- BACK UP the database before running. No users are deleted by this migration.
-- Existing profiles remain active. Run only on the intended Supabase project.
BEGIN;

ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Keep an archived employee profile after their auth.users row is deleted.
ALTER TABLE public.driver_profiles
  DROP CONSTRAINT IF EXISTS driver_profiles_id_fkey;

-- Historical audit records must survive deleting either the actor or the target.
ALTER TABLE public.employee_audit_log
  DROP CONSTRAINT IF EXISTS employee_audit_log_actor_id_fkey;
ALTER TABLE public.employee_audit_log
  DROP CONSTRAINT IF EXISTS employee_audit_log_target_id_fkey;

-- Keep the identity of the employee who changed each trip status.
ALTER TABLE public.trip_status_events
  DROP CONSTRAINT IF EXISTS trip_status_events_actor_id_fkey;

-- Authorization helpers: archived profiles must never confer staff privileges.
CREATE OR REPLACE FUNCTION public.is_dispatch_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.driver_profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_dispatch_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.driver_profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
      AND is_active = true
  );
$function$;

-- Prevent archived users from retaining chat access via old JWTs.
CREATE OR REPLACE FUNCTION public.is_chat_participant(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_participants cp
    JOIN public.driver_profiles dp ON dp.id = cp.user_id
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = auth.uid()
      AND dp.is_active = true
  );
$function$;

-- Prevent archived drivers from changing status on an assigned trip.
CREATE OR REPLACE FUNCTION public.driver_update_trip_status(
  p_trip_id uuid, p_new_status public.trip_status
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_current_status public.trip_status;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.driver_profiles
    WHERE id = auth.uid() AND role = 'driver' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Active driver account required';
  END IF;
  SELECT status INTO v_current_status
  FROM public.trips
  WHERE id = p_trip_id AND assigned_driver_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found or not assigned to you';
  END IF;
  IF NOT (
    (v_current_status::text = 'assigned' AND p_new_status::text = 'on_the_way')
    OR (v_current_status::text = 'on_the_way' AND p_new_status::text = 'arrived')
    OR (v_current_status::text = 'arrived' AND p_new_status::text = 'boarded')
    OR (v_current_status::text = 'boarded' AND p_new_status::text = 'completed')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition';
  END IF;
  UPDATE public.trips
  SET status = p_new_status, updated_at = now()
  WHERE id = p_trip_id;
END;
$function$;

-- Tighten direct reads for archived drivers, while retaining historical rows.
DROP POLICY IF EXISTS trips_driver_read ON public.trips;
CREATE POLICY trips_driver_read ON public.trips FOR SELECT TO authenticated
USING (
  assigned_driver_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.driver_profiles dp
    WHERE dp.id = auth.uid() AND dp.role = 'driver' AND dp.is_active = true
  )
);

DROP POLICY IF EXISTS events_driver_read ON public.trip_status_events;
CREATE POLICY events_driver_read ON public.trip_status_events FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    JOIN public.driver_profiles dp ON dp.id = auth.uid()
    WHERE t.id = trip_status_events.trip_id
      AND t.assigned_driver_id = auth.uid()
      AND dp.role = 'driver' AND dp.is_active = true
  )
);

-- Archived profiles must not be readable by their former owners.
DROP POLICY IF EXISTS profiles_self_or_admin_select ON public.driver_profiles;
CREATE POLICY profiles_self_or_admin_select ON public.driver_profiles FOR SELECT TO authenticated
USING ((id = auth.uid() AND is_active = true) OR public.is_dispatch_admin());

COMMIT;

-- Verification (read-only):
SELECT role, is_active, count(*) FROM public.driver_profiles
GROUP BY role, is_active ORDER BY role, is_active;
