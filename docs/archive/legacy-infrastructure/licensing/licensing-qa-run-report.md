# Licensing QA Run Report

**Run date:** 2026-10-28  
**Scope:** licensing admin lifecycle and QA test-mode implementation. POS billing/inventory workflows are excluded except for the explicit billing authorization response to check-in lease expiry.  
**Status:** local implementation and UI tests passed; hosted QA execution is blocked before migration or data mutation.

## Target verification and remote change ledger

- Local Supabase link metadata points to ref `hooemticmycoqhoccdsn` / `Mini POS Licensing QA`.
- Supabase CLI `projects list` reported the QA ref linked, active/healthy, and in `ap-southeast-1`. The separate production ref was not connected or tested.
- A read-only QA health probe returned HTTP 401 without an API key and the gateway header `sb-project-ref: hooemticmycoqhoccdsn`, confirming the host identity.
- Supabase CLI migration listing showed migrations through `20261005000003` applied on QA; new migration `20261006000000` pending.
- QA `admin` and `api` functions were active at version 4 before this local change. No functions were deployed.
- `db push --dry-run --project-ref hooemticmycoqhoccdsn` failed while authenticating to PostgreSQL: `password authentication failed for user cli_login_postgres`; the environment has no `SUPABASE_DB_PASSWORD`.
- **Remote mutation ledger:** zero migrations, function deployments, secret changes, QA fixture writes, lifecycle changes, or cleanup operations.

## Code delivered locally

- Added QA-only migration `20261006000000_qa_licensing_test_settings.sql` with disabled-by-default settings and bounded enumerated values.
- Added exact-host guard and server policy service for `hooemticmycoqhoccdsn`; settings routes are not registered on other Supabase refs. Settings writes require SUPPORT+AAL2 and produce an audit event.
- Added a settings page with 1/5/15-minute license duration presets, manual/default duration, 30/60/120-second check-in lease presets, seven-day default, and reset control. A QA identity banner is surfaced from server `/admin/me` context.
- License creation can opt into the configured QA duration; the server computes effective start/expiry and returns the database row. The one-time key dialog now shows the returned timestamps.
- Both runtime check-in server implementations read the QA lease only for the exact QA host and only while accelerated mode is enabled; the production/default lease remains seven days, capped at license expiry.
- License detail now shows binding state, latest successful check-in, and offline lease deadline separately from commercial license expiry.
- Admin lifecycle guards reject extension of revoked licenses, expiry reductions through an extend request, and disabling revoked licenses.
- Corrected desktop lease UI to show the actual signed lease deadline instead of claiming every lease lasts seven days.

## Local verification results

| Command | Result | Notes |
|---|---|---|
| `cd admin-ui && npm test` | **33/33 passed** (5 files) | Includes new Settings component coverage. |
| `npx vitest run tests/licensing/qaSettings.test.ts` | **3/3 passed** | QA host guard, bounded value validation, license time boundary. |
| `cd admin-ui && npx playwright test tests/qa-licensing-settings.spec.ts tests/licenses-lifecycle.spec.ts tests/licenses-create.spec.ts --config=playwright.config.ts` | **18/18 passed** | Browser drove local admin UI; Supabase Auth and API were route-mocked. This is not hosted integration. |
| `cd admin-ui && npm run build` | **Passed** | TypeScript and Vite build; existing bundle-size warning (>500 kB). |
| `git diff --check` | **Reported whitespace in pre-existing changed files and test-data logs** | No cleanup was done because those files predate this work. |

## Hosted / desktop result matrix

| Area | Status | Explanation |
|---|---|---|
| Hosted QA schema | **BLOCKED** | Database auth fails because the project database password is unavailable. The migration remains pending. |
| Hosted admin/API deployment | **NOT RUN** | Deployment must follow the migration; QA functions remain at version 4. |
| Real hosted Admin UI + Supabase Auth/MFA | **NOT RUN** | Requires migrated/deployed QA endpoints and a dedicated QA Support user with real TOTP/AAL2 credentials. |
| Hosted short-license activation, expiry, extension, revoke/deactivate, device reassignment | **NOT RUN** | Requires hosted migration/functions, user credentials, and run-scoped fixtures. |
| Hosted lease before/at/after expiry, offline/reconnect, retry/idempotency, tenant authorization | **NOT RUN** | Local UI mocks do not exercise signed server receipts or QA database state. |
| Desktop-client integration / Secure Enclave / Keychain / restart | **NOT RUN** | No compatible hardware-backed client run was performed. Existing local Electron tests are not claimed as this run. |
| Fixture cleanup | **N/A (none created)** | No hosted test fixtures were written. |

## Known limitations and next safe step

The test-mode implementation has not been typechecked or executed inside the hosted Deno Edge runtime because this environment has no Deno executable and QA migration is pending. It must be reviewed and compiled before deployment. The QA DB password should be configured locally for the Supabase CLI without being pasted into chat; then re-run migration dry-run, apply only `20261006000000` to the exact QA ref, deploy only `admin` and `api` from this working tree, verify versions/configuration, and run hosted browser tests with real MFA. Do not proceed against production.

Governance remains unchanged: Option B is implemented; formal Product Owner approval is unverified; full tenant-isolation certification remains blocked. The agreed offline policy is the seven-day signed lease with billing blocked after expiry.
