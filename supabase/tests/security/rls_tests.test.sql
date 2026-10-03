BEGIN;

-- Include pgTAP functions
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Plan the tests (14 tables * 3 checks for anon + 14 tables * 3 checks for auth = 84 tests)
-- Wait, pgTAP has `table_privs_are` which checks if a role has exact privileges on a table.
SELECT plan(28);

-- Test ANON role privileges (should have no privileges)
SELECT table_privs_are('public', 'activation_requests', 'anon', ARRAY[]::text[], 'anon has no privileges on activation_requests');
SELECT table_privs_are('public', 'admin_roles', 'anon', ARRAY[]::text[], 'anon has no privileges on admin_roles');
SELECT table_privs_are('public', 'audit_events', 'anon', ARRAY[]::text[], 'anon has no privileges on audit_events');
SELECT table_privs_are('public', 'customers', 'anon', ARRAY[]::text[], 'anon has no privileges on customers');
SELECT table_privs_are('public', 'device_challenges', 'anon', ARRAY[]::text[], 'anon has no privileges on device_challenges');
SELECT table_privs_are('public', 'devices', 'anon', ARRAY[]::text[], 'anon has no privileges on devices');
SELECT table_privs_are('public', 'license_bindings', 'anon', ARRAY[]::text[], 'anon has no privileges on license_bindings');
SELECT table_privs_are('public', 'licenses', 'anon', ARRAY[]::text[], 'anon has no privileges on licenses');
SELECT table_privs_are('public', 'lifecycle_requests', 'anon', ARRAY[]::text[], 'anon has no privileges on lifecycle_requests');
SELECT table_privs_are('public', 'runtime_checkin_challenges', 'anon', ARRAY[]::text[], 'anon has no privileges on runtime_checkin_challenges');
SELECT table_privs_are('public', 'runtime_checkin_requests', 'anon', ARRAY[]::text[], 'anon has no privileges on runtime_checkin_requests');
SELECT table_privs_are('public', 'runtime_checkins', 'anon', ARRAY[]::text[], 'anon has no privileges on runtime_checkins');
SELECT table_privs_are('public', 'runtime_directive_deliveries', 'anon', ARRAY[]::text[], 'anon has no privileges on runtime_directive_deliveries');
SELECT table_privs_are('public', 'runtime_directives', 'anon', ARRAY[]::text[], 'anon has no privileges on runtime_directives');

-- Test AUTHENTICATED role privileges (should have no privileges)
SELECT table_privs_are('public', 'activation_requests', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on activation_requests');
SELECT table_privs_are('public', 'admin_roles', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on admin_roles');
SELECT table_privs_are('public', 'audit_events', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on audit_events');
SELECT table_privs_are('public', 'customers', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on customers');
SELECT table_privs_are('public', 'device_challenges', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on device_challenges');
SELECT table_privs_are('public', 'devices', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on devices');
SELECT table_privs_are('public', 'license_bindings', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on license_bindings');
SELECT table_privs_are('public', 'licenses', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on licenses');
SELECT table_privs_are('public', 'lifecycle_requests', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on lifecycle_requests');
SELECT table_privs_are('public', 'runtime_checkin_challenges', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on runtime_checkin_challenges');
SELECT table_privs_are('public', 'runtime_checkin_requests', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on runtime_checkin_requests');
SELECT table_privs_are('public', 'runtime_checkins', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on runtime_checkins');
SELECT table_privs_are('public', 'runtime_directive_deliveries', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on runtime_directive_deliveries');
SELECT table_privs_are('public', 'runtime_directives', 'authenticated', ARRAY[]::text[], 'authenticated has no privileges on runtime_directives');

SELECT * FROM finish();

ROLLBACK;
