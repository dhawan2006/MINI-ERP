# RLS Security Audit v1

## 1. Inventory

### Public Tables and RLS Status
Based on the current schema query (`pg_tables`), the following tables exist in the `public` schema. Currently, **Row Level Security (RLS) is disabled (`rowsecurity` = `f`) for all tables**.

| Table Name | RLS Enabled |
| :--- | :--- |
| `activation_requests` | false |
| `admin_roles` | false |
| `audit_events` | false |
| `customers` | false |
| `device_challenges` | false |
| `devices` | false |
| `license_bindings` | false |
| `licenses` | false |
| `lifecycle_requests` | false |
| `runtime_checkin_challenges` | false |
| `runtime_checkin_requests` | false |
| `runtime_checkins` | false |
| `runtime_directive_deliveries` | false |
| `runtime_directives` | false |

### Current Policies
Querying `pg_policies` shows **0 rows**. No RLS policies are currently configured on any public tables.

### Current Grants
Querying `information_schema.role_table_grants` shows that the `anon` and `authenticated` roles currently possess full default privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on all 14 tables. This represents a severe data exposure risk via the Supabase Data API (PostgREST), as any anonymous or authenticated internet user can read and modify all licensing data.

### Views and Functions
- **Views**: There are no public views.
- **SECURITY DEFINER Functions**: There are no public `SECURITY DEFINER` functions in the database.

## 2. Access-Path Map

The following map defines the intended access paths and required privileges.
Note: Edge Functions currently connect using a direct PostgreSQL connection string (`postgresql://postgres:...`) bypassing PostgREST.

| TABLE | ACCESS PATH | ROLE | READ | INSERT | UPDATE | DELETE | RLS REQUIRED | POLICY |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `activation_requests` | Edge Function | postgres | ✔ | ✔ | ✔ | ✖ | YES | Deny all Data API (revoke) |
| `admin_roles` | Admin Edge Function | postgres | ✔ | ✔ | ✔ | ✔ | YES | Deny all Data API (revoke) |
| `audit_events` | Edge Function | postgres | ✔ | ✔ | ✖ | ✖ | YES | Deny all Data API (revoke) |
| `customers` | Admin Edge Function | postgres | ✔ | ✔ | ✔ | ✖ | YES | Deny all Data API (revoke) |
| `device_challenges` | Edge Function | postgres | ✔ | ✔ | ✔ | ✖ | YES | Deny all Data API (revoke) |
| `devices` | Edge Function | postgres | ✔ | ✔ | ✔ | ✖ | YES | Deny all Data API (revoke) |
| `license_bindings` | Edge Function | postgres | ✔ | ✔ | ✔ | ✖ | YES | Deny all Data API (revoke) |
| `licenses` | Edge Function | postgres | ✔ | ✔ | ✔ | ✖ | YES | Deny all Data API (revoke) |
| `lifecycle_requests` | Edge Function | postgres | ✔ | ✔ | ✔ | ✖ | YES | Deny all Data API (revoke) |
| `runtime_checkin_challenges` | Edge Function | postgres | ✔ | ✔ | ✔ | ✖ | YES | Deny all Data API (revoke) |
| `runtime_checkin_requests` | Edge Function | postgres | ✔ | ✔ | ✔ | ✖ | YES | Deny all Data API (revoke) |
| `runtime_checkins` | Edge Function | postgres | ✔ | ✔ | ✖ | ✖ | YES | Deny all Data API (revoke) |
| `runtime_directive_deliveries` | Edge Function | postgres | ✔ | ✔ | ✖ | ✖ | YES | Deny all Data API (revoke) |
| `runtime_directives` | Edge Function | postgres | ✔ | ✔ | ✔ | ✖ | YES | Deny all Data API (revoke) |

**Access Path Summary**:
- **Electron App**: Never connects directly to PostgreSQL or the Data API. Interacts only via Edge Function HTTP endpoints.
- **Admin Web Browser**: Will authenticate via Supabase Auth and interact exclusively through Admin Edge Functions with strict server-side authorization checks.
- **Edge Functions**: Connect directly via `postgres` credential.
- **Supabase Data API (anon/authenticated)**: Should have **NO** access to these tables.
