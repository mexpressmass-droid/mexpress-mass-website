# Dispatch database security review

These migrations are candidates, not applied to the shared database. They change access for every client of that database, including production. Obtain explicit approval for the target environment before applying.

## Prerequisites and order

1. Deploy PR #5's scoped staff RPC reads and inline client revisions to every affected client. Old browser tabs may require reload. Do not deploy production without approval.
2. In an isolated Supabase environment, apply the active-chat, monotonic-revision, then column-access migrations in timestamp order.
3. Run the isolated SQL tests with PGLITE_MODULE pointing to @electric-sql/pglite@0.5.14. Run the application regression tests and build.
4. Validate actual PostgREST filters (id=in plus cursor, RPC paging), Realtime authorization/delivery with restricted columns, fallback polling, archived/imported rides, and independent Dispatcher/Driver sessions against that environment. PGlite cannot validate PostgREST or Supabase Realtime.
5. Capture current grants/function definitions and a database backup before an approved shared rollout. Apply in a maintenance window; run advisors and repeat role checks. No migration should disable RLS.

## Access contract

Authenticated users retain explicit SELECT privileges only on driver-facing columns and routing/version fields. Existing RLS still limits rows and account activity. price_cents, internal_notes, passenger_email, source and archive_source are not directly readable. New columns receive no automatic client privilege.

Dispatcher/Admin full records use the existing dispatch_get_trips RPC with its active-staff check. Client INSERT/UPDATE/DELETE privileges, including legacy column grants, are removed. Server service_role privileges remain unchanged; the role-checked Worker handles staff writes. The existing driver_update_trip_status SECURITY DEFINER function retains its active-driver, assigned-trip and transition checks. Tests cover old-driver denial and new-driver success after reassignment, repeated-transition rejection and inactive accounts.

The existing driver_trips security_invoker view continues to use the granted safe columns. No new SECURITY DEFINER function is introduced by the column migration. Existing privileged functions and service-role consumers still need to be included in deployment review; this migration does not restrict the service role.

## Recovery

Each migration is transactional. If validation fails before COMMIT, roll back that transaction. After commit, pause affected writes and diagnose the failing client/RPC first. Restore the captured previous function/grant definitions only with explicit approval: reverting grants would restore the confidentiality/direct-write exposure. Do not use a blanket GRANT ALL as an automatic rollback.

## Remaining validation

No live shared migration has been applied. Restricted-column Realtime payload behavior and live PostgREST integration require an isolated Supabase deployment; do not infer those results from SQL unit tests. Physical network disconnect is unavailable in the current browser and is covered only by simulated failure tests. Two-driver reassignment is verified in isolated PostgreSQL, not with two newly authenticated browser sessions.
