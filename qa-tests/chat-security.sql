-- Synthetic fixture; execute ONLY in an isolated empty PostgreSQL database.
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.driver_profiles(id uuid PRIMARY KEY, username text, display_name text, role text, is_active boolean);
CREATE TABLE public.chat_conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user1_id uuid,user2_id uuid);
CREATE UNIQUE INDEX chat_pair ON public.chat_conversations(LEAST(user1_id,user2_id),GREATEST(user1_id,user2_id));
CREATE TABLE public.chat_participants(conversation_id uuid,user_id uuid,PRIMARY KEY(conversation_id,user_id));
INSERT INTO public.driver_profiles VALUES
('00000000-0000-4000-8000-000000000001','test_staff','TEST ONLY STAFF','dispatcher',true),
('00000000-0000-4000-8000-000000000002','test_driver','TEST ONLY DRIVER','driver',true),
('00000000-0000-4000-8000-000000000003','test_inactive','TEST ONLY INACTIVE','dispatcher',false),
('00000000-0000-4000-8000-000000000004','test_driver2','TEST ONLY DRIVER 2','driver',true),
('00000000-0000-4000-8000-000000000005','test_unknown','TEST ONLY UNKNOWN','unknown',true);
