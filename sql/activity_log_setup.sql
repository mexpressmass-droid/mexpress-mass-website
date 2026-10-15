-- Run in the TEST Supabase SQL Editor.
-- First run sql/employee_audit_log.sql if the audit table does not exist.
create index if not exists audit_actor_time on public.employee_audit_log(actor_id,created_at desc);
create index if not exists audit_role_time on public.employee_audit_log(actor_role,created_at desc);
alter table public.employee_audit_log enable row level security;
revoke all on public.employee_audit_log from anon,authenticated;
create or replace function public.log_trip_audit() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor uuid := auth.uid(); employee_role text;
begin
 if actor is null then return new; end if;
 select role into employee_role from public.driver_profiles where id=actor;
 if employee_role is null then return new; end if;
 if tg_op='UPDATE' and row(new.status,new.assigned_driver_id,new.pickup_at,new.pickup_address,new.dropoff_address,new.price_cents)
 is distinct from row(old.status,old.assigned_driver_id,old.pickup_at,old.pickup_address,old.dropoff_address,old.price_cents) then
 insert into public.employee_audit_log(actor_id,actor_role,action,target_id,details)
 values(actor,employee_role,'ride_changed',actor,jsonb_build_object('source','web','ride_id',new.id,'previous_status',old.status,'status',new.status,'previous_driver',old.assigned_driver_id,'driver',new.assigned_driver_id,'previous_pickup',old.pickup_at,'pickup',new.pickup_at));
 end if;
 return new;
end $$;
drop trigger if exists trip_audit_trigger on public.trips;
create trigger trip_audit_trigger after update on public.trips
for each row execute function public.log_trip_audit();
