# License Lifecycle Production-Readiness Workflow

**Scope:** license activation/deactivation and reassignment, renewal/extension, expiry, connectivity, and offline check-in leases. POS billing, inventory, and other in-app features are excluded.

**Target:** Hosted QA project `hooemticmycoqhoccdsn` (Mini POS Licensing QA), confirmed from `supabase/.temp/project-ref` and `linked-project.json` on 2026-10-28. Production ref `rmkosqdgltiimdhpmrsk` is prohibited. This document does not authorize production access or deployment.

**Execution status:** workflow and test matrix defined. Local admin unit/build and mocked Playwright UI checks were run on 2026-10-28; hosted lifecycle scenarios were not run. Execute results must be appended with date, test command, project ref, run ID, and artifact paths.

## Repository findings

- Admin UI already exposes license creation, extension, disable, restore, revoke, and device binding release. Server routes apply MFA requirements, role checks, tenant scoping, audit records, and idempotency.
- Runtime activation and check-in have challenge/proof verification and request idempotency. Runtime check-in receipts currently use a fixed seven-day lease capped at license expiry in `supabase/functions/_shared/services/RuntimeCheckinService.ts`.
- There is no admin setting/API for QA test mode, short license presets, or configurable offline lease duration. A browser-only setting cannot change the server-issued signed lease. This is an implementation gap and must be addressed server-side before short-lease UI testing is claimed.
- `admin-ui/playwright.config.ts` currently hardcodes local Supabase endpoints, so it does not exercise hosted QA. Existing hosted integration specs include synthetic AAL2 assumptions and are not interchangeable with real hosted Supabase TOTP flows.
- The working tree already contains extensive user changes and generated Playwright artifacts. Keep them intact; do not reset or clean the tree.
- Governance remains: Option B implemented, formal Product Owner approval unverified, full tenant-isolation certification blocked. This workflow does not change those statuses.

## Safe test-mode requirements

Before lifecycle E2E runs, implement a server-enforced QA-only setting with these requirements:

1. Test mode is disabled by default. It can only be enabled when the server environment is explicitly QA; production must refuse the setting regardless of browser input.
2. Admin settings offer bounded license durations (for example 2, 5, and 15 minutes) and bounded offline leases (for example 30, 60, and 120 seconds). Show the effective server value and persist changes in the QA database with an audit event.
3. The runtime check-in signer reads the effective QA lease duration server-side and caps it at the license's `valid_until`. Production retains the fixed production policy and has no mutation route for test settings.
4. The admin UI labels the QA environment and displays a persistent test-mode banner. Require elevated role/MFA for changing test settings. Validate settings at the API boundary; never accept arbitrary environment or project refs from the client.
5. Add a preflight guard that checks the exact Supabase URL/ref against the approved QA ref and fails closed on any other remote host. Tests should use run-specific fixture prefixes and cleanup in `finally`/`afterAll`.

## Deterministic end-to-end matrix

Run each scenario with a unique fixture/license/device per run. Use real hosted Supabase Auth MFA for sensitive admin operations. Capture request/response status (redacting tokens and license secrets), DB state assertions, screenshots for UI state, and Playwright trace on failure.

| ID | Scenario | Action | Expected result / evidence |
|---|---|---|---|
| PRE-01 | Target safety | Read project ref and URL before any fixture creation | Exact ref is `hooemticmycoqhoccdsn`; abort on mismatch or production host |
| PRE-02 | Connectivity baseline | Admin UI loads, sign in, `/admin/me`, list licenses | QA banner/ref visible; server reachable; no secret in browser storage/logs |
| ACT-01 | Valid first activation | Create short-lived license, activate on unbound device using challenge/proof | Success receipt; one ACTIVE binding; DB and UI agree |
| ACT-02 | Invalid/unknown key | Activate malformed and unknown keys | Stable error UI; no binding/device mutation; no secret leakage |
| ACT-03 | Before valid_from | Activate not-yet-valid license | Rejected at boundary; no binding |
| ACT-04 | Exact expiry boundary | Evaluate just before, exactly at, and just after valid_until using controlled server/test clock | Allowed before; denied at/after per documented inclusive/exclusive semantics; no timezone drift |
| ACT-05 | Device limit | Activate on allowed device then another device over limit | Second denied, first binding unchanged |
| ACT-06 | Repeated request | Replay same request ID and payload, then same ID with changed payload | Same response for replay; conflict for changed payload; one mutation/audit event |
| ACT-07 | Retry after network loss | Drop response after server commit, retry same ID | Retry returns committed result; no duplicate binding |
| DEV-01 | Reassignment | Admin releases active binding, then activate on another eligible license/device | Old binding DEACTIVATED with timestamp/audit; reassignment follows policy; former tenant cannot operate old binding |
| DEV-02 | Duplicate deactivation | Deactivate/release twice | Deterministic already-deactivated/conflict UI; no duplicate state transition |
| DEV-03 | Wrong device proof | Sign activation/deactivation with wrong key/device | Rejected; binding remains unchanged |
| EXT-01 | Extend before expiry | Extend via admin UI with reason and idempotency key | valid_until increases; audit record; license remains usable; no new key unexpectedly exposed |
| EXT-02 | Extend after expiry | Extend expired license | Explicit documented policy; test activation after extension and binding behavior |
| EXT-03 | Duplicate extension | Retry same request and then alter payload with same key | Idempotent replay; conflict on changed payload |
| EXT-04 | Invalid extension | Earlier/equal expiry, malformed date, unauthorized role, AAL1 | Rejected with clear UI; expiry unchanged |
| LIFE-01 | Disable/restore | Disable then restore via admin panel | Runtime denies while disabled; restore only where policy allows; audit/UI state accurate |
| LIFE-02 | Revoke | Revoke license | Irreversible status; active bindings stop functioning; UI disables further lifecycle actions |
| NET-01 | Online to offline | Obtain valid signed check-in lease, remove network, use app within lease | Existing lease works until server-provided expiry; UI remains coherent |
| NET-02 | Lease boundary | Use offline immediately before, at, and after `checkInValidUntil` | Works before; expires at/after; activation/network-required UI appears as designed |
| NET-03 | Offline activation | Attempt new activation without network | Clear connectivity/error UI; no local false success or persisted invalid authorization |
| NET-04 | Reconnect | Restore network after offline use, check in | Fresh signed receipt replaces old lease; status reconciles without duplicate state |
| NET-05 | Intermittent connectivity | Fail challenge, fail completion, timeout, retry | Bounded retry/backoff; stale challenge rejected; retry obtains fresh challenge |
| LEASE-01 | Short lease | Set QA lease to each allowed short interval, perform signed check-in | Receipt duration matches selected setting or license expiry cap; actual signed server value verified |
| LEASE-02 | License caps lease | License expires sooner than configured lease | Receipt is capped at license expiry |
| LEASE-03 | Bad/absent server setting | Invalid config, missing config, attempt production setting | Fail closed or safe documented default; production cannot enable QA short lease |
| TEN-01 | Tenant boundary read | Tenant A reads own and Tenant B licenses/devices | Own data only; foreign object not found/forbidden without existence leak |
| TEN-02 | Tenant boundary mutation | Tenant A attempts extend/release/revoke Tenant B resource | Denied; DB state/audit unchanged except approved security logging |
| TEN-03 | Role/MFA | Run mutation as each allowed/denied role with AAL1/AAL2 | Role matrix and MFA policy enforced independently |
| UI-01 | Lifecycle presentation | Inspect list/detail/modal after each state transition | Status, expiry, binding, disabled actions, error/retry state match server result |
| CLK-01 | Clock skew | Client clock ±5 minutes; malformed/expired local receipt | Server time authoritative; no extension of signed lease; invalid receipts fail closed |
| CLEAN-01 | Fixture cleanup | Finish/fail each scenario | Only run-prefixed fixtures removed; cleanup result captured; no broad DB reset |

## Execution sequence

1. **Read-only preflight:** inspect `supabase/config.toml`, linked ref, admin UI endpoint env, migration status, function versions, QA project name/region. Verify exact ref and confirm QA classification from Supabase project metadata. Do not run `db push`, deploy, set secrets, or write rows before this gate.
2. **Code and schema review:** trace Admin UI → API → Edge Function → service → SQL, plus POS activation/check-in → challenge → proof → binding → signed receipt. Review migrations and RLS, role/MFA boundaries, audit/idempotency, and clock assumptions.
3. **Implement QA controls:** add and review the server-enforced QA-only settings described above. Add migration/API/UI and unit tests. Keep production behavior and governance untouched.
4. **Local validation:** run focused UI/service tests, migration checks, and Playwright against local Supabase first. Resolve failures before hosted QA.
5. **Hosted QA change gate:** after ref preflight, apply only the reviewed additive migration and deploy only the relevant admin/API functions to `hooemticmycoqhoccdsn`. Never target the production ref. Verify deployed function health and settings are disabled by default.
6. **Hosted Playwright run:** use a dedicated `QA_BASE_URL`/`VITE_SUPABASE_URL`, browser UI and real QA database. Run sequentially for stateful lifecycle tests; parallelize only isolated read-only cases. Verify fixture DB state after each mutation and clean up only run-owned data.
7. **Failure/recovery pass:** repeat connectivity, timeout, retry, idempotency, stale challenge, clock-boundary, tenant, role, and MFA cases. Preserve traces/screenshots and redact auth material.
8. **Report:** list exact commit/tree state, QA ref, deployment changes, commands, scenario counts, pass/fail/blocked results, artifact paths, cleanup result, and remaining risks. Do not call the system production-ready or tenant-isolation certified while governance gates remain open.

## Evidence ledger

No new hosted test execution is recorded in this workflow document. Append one row per actual run; do not infer results from prior reports.

| Date/time | QA ref | Commit/tree | Command/run ID | Passed / failed / blocked | Evidence | Cleanup |
|---|---|---|---|---|---|---|
| 2026-10-28 local | N/A (mocks) | Working tree contains pre-existing changes | `cd admin-ui && npm test` | 31/31 passed, 4 files | Vitest terminal output | N/A |
| 2026-10-28 local | N/A (mocks) | Working tree contains pre-existing changes | `cd admin-ui && npm run build` | Build passed; chunk-size warning (>500 kB) | Vite build output | N/A |
| 2026-10-28 local | N/A (mocks) | Working tree contains pre-existing changes | `cd admin-ui && npx playwright test tests/licenses.spec.ts --config=playwright.config.ts` | 2/2 passed | Playwright terminal output; mocked endpoints, not live Supabase | N/A |
| Not run | `hooemticmycoqhoccdsn` | Working tree contains pre-existing changes | Hosted QA Playwright | Blocked pending server-side test-mode/lease control and hosted-safe Playwright target guard | — | — |

## Current unresolved blockers

- The Admin UI lacks the requested test-mode settings and the backend currently hardcodes a seven-day check-in lease. Do not claim short lease test coverage until a server-side QA-only control exists and hosted function behavior is verified.
- Playwright's current admin config targets local Supabase. Hosted tests need explicit endpoint/ref configuration plus a production-host deny guard.
- Existing hosted reports are historical artifacts, not evidence that this workflow or current working tree passed.
- Option B remains implemented; formal Product Owner approval and full tenant-isolation certification remain unverified/blocked.

## 2026-10-28 execution update

**Fresh execution status:** local admin UI unit tests passed; mocked Playwright lifecycle UI passed; hosted QA lifecycle testing was blocked before any remote mutation.

| Check | Command / method | Result | Evidence / limits |
|---|---|---|---|
| Target reference | Read `supabase/.temp/project-ref` and `supabase/.temp/linked-project.json` | `hooemticmycoqhoccdsn` — Mini POS Licensing QA | Local link metadata only; the local project name is recorded, but live Supabase project metadata could not be fetched. Production ref remains excluded. |
| Hosted network preflight | `curl -I https://hooemticmycoqhoccdsn.supabase.co/auth/v1/health` | BLOCKED | DNS resolution failed (`Could not resolve host`). No hosted requests or writes were made. |
| Local Supabase availability | Docker availability check | BLOCKED | Docker is unavailable in this environment, so the local Supabase stack/database could not be started. |
| Admin UI unit tests | `cd admin-ui && npm test` | **31/31 passed** (4 files) | Fresh run, 2026-10-28. |
| Lifecycle admin UI Playwright | `cd admin-ui && npx playwright test tests/licenses-lifecycle.spec.ts --config=playwright.config.ts` | **10/10 passed** | Fresh run, local Vite/admin UI with mocked Supabase/auth/API responses. Not hosted integration evidence. Playwright required permission to bind `::1:5173`. |

### Execution decision

The repository link ref is unambiguous and matches the designated QA ref in the existing records, but this environment could not independently query Supabase project metadata or reach the QA endpoint. Per the required safety gate, no hosted fixtures, database changes, migrations, secrets, or function deployments were attempted. The server-side short-lease/test-mode control is still absent, and the seven-day lease remains hard-coded in both runtime check-in implementations. Therefore activation, device reassignment, real lease expiry/reconnect, database assertions, tenant authorization, and hosted UI/API scenarios remain **NOT RUN**. Historical QA reports elsewhere in this repository do not substitute for this run.

This update does not alter governance: Option B is implemented, formal Product Owner approval is unverified, and full tenant-isolation certification remains blocked.

## Phase B/C implementation update — 2026-10-28

The user confirmed the policy: retain the seven-day signed offline lease and block billing after lease expiry. Local implementation now provides a bounded QA-only duration/lease settings UI and server policy, adds a scoped license binding/check-in detail view, displays server-issued license start/expiry, replaces the Audit Logs placeholder with an audit list, and rejects invalid lifecycle expiry/status transitions. Local admin unit tests passed 33/33, QA policy tests 3/3, Playwright UI tests 18/18, and the admin UI build passed. The >500 kB bundle warning remains.

The QA project was independently confirmed from Supabase CLI metadata and gateway header. The new migration is pending. The CLI dry-run reached the QA Postgres host but failed database authentication because `SUPABASE_DB_PASSWORD` is unavailable. No migration, function deployment, QA data write, or hosted lifecycle test was performed. See `docs/licensing-qa-run-report.md` and `docs/licensing-release-readiness.md`.
