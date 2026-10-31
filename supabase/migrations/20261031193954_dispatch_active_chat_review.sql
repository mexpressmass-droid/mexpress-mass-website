-- REVIEW ONLY: do not apply to a shared/production database without approval.
-- Preserve signatures, search_path, permissions and driver-to-driver restrictions.
BEGIN;
CREATE OR REPLACE FUNCTION public.chat_employee_directory()
 RETURNS TABLE(id uuid, username text, display_name text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT
        p.id,
        p.username,
        p.display_name,
        p.role
    FROM public.driver_profiles p
    WHERE auth.uid() IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM public.driver_profiles me
          WHERE me.id = auth.uid()
            AND me.is_active = true
            AND me.role IN ('admin', 'dispatcher', 'driver')
      )
      AND p.is_active = true
      AND p.role IN ('admin', 'dispatcher', 'driver')
      AND p.id <> auth.uid()
      AND (
          p.role <> 'driver'
          OR EXISTS (
              SELECT 1
              FROM public.driver_profiles me
              WHERE me.id = auth.uid()
                AND me.role IN ('admin', 'dispatcher')
          )
      )
    ORDER BY p.display_name;
$function$;

CREATE OR REPLACE FUNCTION public.open_private_chat(p_other_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_my_id uuid := auth.uid();
    v_my_role text;
    v_other_role text;
    v_chat_id uuid;
BEGIN
    IF v_my_id IS NULL OR p_other_user_id IS NULL
       OR v_my_id = p_other_user_id THEN
        RAISE EXCEPTION 'Invalid chat participants';
    END IF;

    SELECT role INTO v_my_role
    FROM public.driver_profiles
    WHERE id = v_my_id AND is_active = true AND role IN ('admin','dispatcher','driver');

    SELECT role INTO v_other_role
    FROM public.driver_profiles
    WHERE id = p_other_user_id AND is_active = true AND role IN ('admin','dispatcher','driver');

    IF v_my_role IS NULL OR v_other_role IS NULL THEN
        RAISE EXCEPTION 'Employee not found';
    END IF;

    IF v_my_role = 'driver' AND v_other_role = 'driver' THEN
        RAISE EXCEPTION 'Driver-to-driver chats are not allowed';
    END IF;

    INSERT INTO public.chat_conversations (
        user1_id, user2_id
    )
    VALUES (v_my_id, p_other_user_id)
    ON CONFLICT (
        (LEAST(user1_id, user2_id)),
        (GREATEST(user1_id, user2_id))
    )
    DO NOTHING;

    SELECT id INTO v_chat_id
    FROM public.chat_conversations
    WHERE LEAST(user1_id, user2_id)
          = LEAST(v_my_id, p_other_user_id)
      AND GREATEST(user1_id, user2_id)
          = GREATEST(v_my_id, p_other_user_id);

    INSERT INTO public.chat_participants (
        conversation_id, user_id
    )
    VALUES
        (v_chat_id, v_my_id),
        (v_chat_id, p_other_user_id)
    ON CONFLICT DO NOTHING;

    RETURN v_chat_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.chat_employee_directory() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_private_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_employee_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_private_chat(uuid) TO authenticated;
COMMIT;
