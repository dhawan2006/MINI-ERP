# Phase 3B - Admin API Integration & Real Dashboard

## Status
Integration of the Phase 3A Admin API with the Phase 3B Admin Dashboard is complete.

## API Integration Architecture
The frontend acts as an untrusted client in the browser. It obtains an `access_token` from Supabase Auth and strictly passes it via `Authorization: Bearer <token>` to the backend Supabase Edge Functions (`/v1/admin`).

### Security Boundaries
- **No Direct Table Queries**: The browser app does not query `pg_tables`, `admin_roles`, or any core domain tables.
- **Role Derivation**: An `/admin/me` endpoint was implemented to return the current admin's ID, role, and AAL context explicitly derived from the verified Supabase Auth JWT inside the secure edge function.
- **Server Enforcement**: All role checks (e.g., `ADMIN`, `OWNER`) and `AAL2` checks continue to be enforced on the Edge Function server. The frontend merely uses role context to disable inputs or hide tabs for UX purposes.
- **Secrets Audited**: Inspected the production bundle. No instances of `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_API_TOKEN`, `DATABASE_URL`, or `LICENSE_KEY_HMAC_SECRET` are exposed in the bundle. 

## Endpoints Integrated
1. `GET /v1/admin/me`: Retrieves current authenticated Admin's role and AAL level (derived from JWT inside Edge Function).
2. `GET /v1/admin/dashboard/summary`: Retrieves aggregated system metrics for the dashboard.

## Displayed Metrics
The Dashboard now displays real server-provided aggregations (handled by `AdminDashboardService.getSummary`):
- Total Active Licenses
- Total Customers
- Active Bindings (Devices)
- Revoked Licenses
- Recent Check-ins (last 24 hours)
- Overdue Check-ins (missed dead-man switch)

### Known API Limitations
- **Licenses Due Soon**: The Phase 3A API does not currently offer an aggregate endpoint for "licenses expiring soon." The Dashboard UI gracefully reports this metric as unsupported ("Metric requires backend aggregate endpoint") rather than fetching all records.

## Error Handling
The centralized `api/client.ts` (`adminFetch`) intercepts all HTTP errors:
- **401 Unauthorized**: Handled by gracefully logging the user out and redirecting to `/login`.
- **403 Forbidden**: Passed up to UI. The Dashboard displays a warning indicating lack of privileges (or AAL2 enforcement).
- **500 Server Error**: Passed up as a generic "Admin service temporarily unavailable".

## Testing
- **Unit Tests (Vitest)**: Implemented tests in `client.test.ts` to assert that `adminFetch` correctly handles session retrieval, 401, 403, network disconnections, and malformed JSON errors. 6/6 passed.
- **E2E Tests (Playwright)**: Implemented `dashboard.spec.ts` testing the complete login loop, role appearance, mocked API summary loading, refresh button, and logout flows. The testing environment was updated to inject proper `.env` configuration allowing `supabase-js` to initialize correctly without hardcoding production parameters. 2/2 passed.
- **Regression Tests (Phase 3A)**: Added regression coverage for `/admin/me` directly into the existing Phase 3A server-side test suite (`admin-me.test.ts`). This guarantees the endpoint correctly handles JWT parsing, requires auth, and blocks client-side impersonation.

## Build
The Admin UI compiles correctly and builds cleanly via Vite and `tsc` with no unresolved dependencies.
