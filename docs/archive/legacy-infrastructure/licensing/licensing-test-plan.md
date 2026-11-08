# Licensing Test Plan — Phase A Discovery

**Date:** 2026-10-28  
**Status:** Plan only. No implementation or hosted execution was performed for this Phase A task.  
**Hosted target:** QA ref `hooemticmycoqhoccdsn` only, after authoritative live project identity verification. Production ref `rmkosqdgltiimdhpmrsk` is denied.

## Test layers and current evidence

| Layer | Intended target | Existing assets | Phase A status |
|---|---|---|---|
| Unit | Node/Vitest, Deno/Vitest, React Testing Library | `tests/licensing/*`, `server/licensing/tests/*`, `supabase/functions/tests/*`, `admin-ui/src/**/__tests__/*`, `src/shared/crypto/**/__tests__/*` | Inventory only. Previous turn fresh admin-ui run: 31/31; no results asserted here beyond that record. |
| Local integration | Local Postgres/Supabase and Node server | `tests/licensing/runtime-checkin-postgresjs.test.ts`, `electron/licensing/__tests__/RuntimeCheckInCoordinator.integration.test.ts`, `tests/supabase/*` | Not run in Phase A. Docker unavailable in previous environment probe. |
| Admin browser UI | Admin React UI | `admin-ui/tests/licenses-lifecycle.spec.ts`, other `admin-ui/tests/licenses-*` | Lifecycle UI test from previous turn passed 10/10 against route mocks; does not prove backend integration. |
| Hosted QA browser | Real admin UI, Supabase Auth/MFA, deployed Edge Functions and QA DB | `admin-ui/tests/licenses-real-integration.spec.ts`, MFA suites, tenant suites; config currently local-oriented | Not safe to run until dedicated QA config/guard and live project verification exist. Some suites use synthetic AAL2 and are unsuitable for hosted auth as written. |
| Desktop client | Electron app + actual local signed auth + runtime server | `tests/e2e/licensing-real/{activation-real,restart-offline,full-matrix}.spec.ts` | Requires separate review of fixture identity/provider and installed native helper; not yet verified as genuine hardware-backed hosted run. |
| Manual platform | macOS hardware Secure Enclave, OS restart, Keychain persistence | Swift identity helper under `electron/native/MiniPOSIdentityHelper` | Not automatable in current discovery; explicitly mark not run unless exercised on compatible hardware. |

## Preconditions / safety gates

1. Obtain authoritative Supabase CLI/project metadata proving the selected remote is exactly `hooemticmycoqhoccdsn` and is the QA project; stop on missing/ambiguous identity or production ref.
2. Verify deployed migrations/functions and QA-only credentials without printing secrets. No deploy/migration/secret mutation without a separately reviewed command/target.
3. Create a unique run ID and dedicated test customer/users; use real Supabase Auth and real MFA/AAL2 for authorized mutations. Do not use synthetic AAL2 tokens for hosted tests.
4. Hosted Playwright must use the real admin UI and lifecycle requests. Direct API/DB is limited to fixture setup, assertions, and run-scoped cleanup.
5. Capture redacted statuses, audit IDs, UI screenshots/trace, and before/after database state. Never capture the plaintext key after its one-time display, credentials, bearer tokens, private keys, or secret settings.
6. Cleanup only IDs created by that run, scoped by IDs and run prefix; execute in `finally`; record orphan fixtures if cleanup fails.
7. Policy resolved: the seven-day signed check-in lease blocks billing. Keep license expiry distinct from check-in lease expiry. QA-only short leases must be tested against server-signed receipts and the same billing gate.

## Deterministic scenario matrix

Status legend: **NOT RUN** means no execution evidence yet; **BLOCKED** means a prerequisite is known unavailable. All cases below are currently NOT RUN unless called out in the evidence notes above.

| ID | Scenario | Method / assertion | Current status |
|---|---|---|---|
| AUTH-01 | Valid login and authenticated route | Real Auth session, `/admin/me`, role context, reload | NOT RUN (hosted) |
| AUTH-02 | Invalid credentials / logged-out deep link | Verify error feedback and protected redirect | NOT RUN (hosted) |
| AUTH-03 | Expired session / refresh | Expire/refresh session, no indefinite loading, protected API stops | NOT RUN (hosted) |
| AUTH-04 | MFA and role enforcement | AAL1 denied where required, real TOTP AAL2 permits allowed role, wrong role still denied | NOT RUN (fresh hosted) |
| TEN-01 | Tenant A reads/mutates Tenant B | Real UI resource routes and DB unchanged after denial | NOT RUN; certification remains blocked |
| LIC-01 | Create QA customer and issue license | Through UI; one-time key display; row/customer/status/expiry/audit verified | NOT RUN (hosted) |
| ACT-01 | Valid activation on eligible device | Actual challenge/proof flow; binding, device, signed authorization, UI state verified | NOT RUN (hosted desktop) |
| ACT-02 | Invalid/unknown/revoked/disabled/expired key | Stable errors, no partial binding or secret leakage | NOT RUN |
| ACT-03 | Not-yet-valid license and exact expiry boundary | Server clock; verify inclusive/exclusive policy `[valid_from, valid_until)` | NOT RUN; code indicates expiry boundary exclusive |
| ACT-04 | Device cap / same device / second device | Same-device replay behavior; second device denied when capped; DB binding count | NOT RUN |
| ACT-05 | Duplicate/concurrent/retried activation | Same request replay, changed payload conflict, timeout after commit, no duplicate binding/audit | NOT RUN |
| LIFE-01 | Extend active license before/near expiry | UI confirmation, exact `valid_until`, audit, idempotency, desktop refresh | NOT RUN |
| LIFE-02 | Extend expired license and repeat/concurrent extension | Establish supported policy; no invented expected behavior | NOT RUN; product semantics needed |
| LIFE-03 | Disable / restore / revoke separately | Correct action visibility, status/binding effects, audit, authorization | NOT RUN |
| LIFE-04 | Deactivate twice / invalid / foreign binding | Online device proof; deterministic error; DB unchanged on failure | NOT RUN |
| DEV-01 | Admin release and reassignment | MFA UI action; binding timestamps/audit; scope; new device reactivation | NOT RUN |
| DEV-02 | Automatic device rebinding during activation | Verify old binding transition and user-visible policy | NOT RUN; behavior exists in source |
| NET-01 | Online activation/check-in then network loss | Browser/client states and signed timestamps; no false success | NOT RUN |
| NET-02 | Offline start, retries, timeout, DNS/TLS/server 5xx | Bounded retries/backoff; remains in last verified state; no broken UI | NOT RUN |
| LEASE-01 | Check-in lease before/at/after expiry | Real signed receipt and server/client exact boundary; distinct from license expiry | NOT RUN; short lease control absent |
| LEASE-02 | Reconnect before/after lease expiry | Fresh receipt, recovery UI, no duplicate records; license still valid vs expired variants | NOT RUN |
| LEASE-03 | Disable/revoke while offline, reconnect | No claim of immediate offline effect; verify next successful check-in/directive behavior | NOT RUN |
| CLK-01 | Client clock skew forward/backward and rollback | No client clock override; signed server time/anti-rollback; restart persistence | NOT RUN |
| CRYPTO-01 | Tampered payload/signature/device/license/key ID | Signature/protocol/context verifier fails closed; no authorization update | NOT RUN |
| UI-01 | Loading, errors, empty state, stale data, pagination/refresh | Actual UI and authoritative API/DB agree after success/failure | NOT RUN hosted; mocked subset exists |
| AUD-01 | Lifecycle audit and idempotency consistency | One expected event/mutation per successful request; no mutation on denied request | NOT RUN hosted |
| CLEAN-01 | Run-scoped cleanup on success and failure | Verify created identifiers absent/archived per audit policy; no broad delete | NOT RUN |
| DESK-01 | Secure Enclave/Keychain real operation and restart | Compatible macOS hardware; actual app; verify identity continuity | NOT RUN; hardware unavailable/unconfirmed |

## Execution ordering after Phase A approval

1. Validate remaining policy questions: how restore affects bindings and how expired licenses may be extended.
2. QA-only test settings are implemented locally (server-checked QA ref, default off, bounded presets, role/MFA, audit, reset). Hosted validation remains pending; local implementation is not certification.
3. Validate parallel Node/Edge behavior and identify the deployed path before writing browser tests.
4. Run unit/local integration tests and admin UI tests, then local Supabase Playwright with controlled fixtures.
5. Verify the hosted QA ref from authoritative live metadata; deploy only reviewed additive QA changes if separately authorized and confirmed.
6. Execute hosted browser suite sequentially for stateful cases, collecting DB assertions and audit evidence.
7. Execute desktop integration separately on available hardware; distinguish fake identity provider and software-only fixtures from Secure Enclave runs.
8. Rerun regression cases and generate a report separating local, hosted, and desktop results. Do not equate passing browser mocks with full lifecycle certification.

## Product decisions required before expected-result assertions

- The seven-day signed check-in lease and billing block were confirmed by the product owner for this project; hosted behavior still requires verification.
- Does restoring a disabled license reactivate its prior device bindings? Inspect/confirm intended behavior.
- Is extending an already expired license supported, and if so is the new expiry additive or calculated from now?
- Should admin release/revoke affect an offline client only on its next check-in, via existing directive, or by some other mechanism?
- QA test presets use bounded durations in the settings UI; verify these are the only accepted server values and that QA mode cannot be enabled on another project.

## Evidence and governance

Previous-turn fresh local evidence: `cd admin-ui && npm test` — 31/31 passed; `cd admin-ui && npx playwright test tests/licenses-lifecycle.spec.ts --config=playwright.config.ts` — 10/10 passed using mocked auth/API and a local Vite browser. Previous hosted preflight failed DNS resolution and Docker was unavailable. These are local UI/unit results only. No hosted lifecycle result is claimed here.

Option B remains implemented; formal Product Owner approval is unverified, and full tenant-isolation certification remains blocked. Production is excluded.

### Local Phase B/C execution update — 2026-10-28

| Layer / suite | Result | Scope |
|---|---|---|
| Admin UI Vitest | **33/33 passed**, 5 files | Local components/API mocks, including QA settings save/reset. |
| QA policy Vitest | **3/3 passed** | Exact QA host guard, bounded preset validation, and half-open license validity state. |
| Admin browser Playwright | **18/18 passed** | Local Vite/admin UI with mocked Supabase Auth and Admin API: QA settings, reset, QA license intent/server-returned expiry display, license creation, extension, disable/restore/revoke, validation, retries/network feedback. Not hosted evidence. |
| Admin UI production build | **Passed** | `tsc -b && vite build`; existing >500 kB chunk warning remains. |
| Hosted DB migration dry-run | **BLOCKED** | Supabase CLI could reach project metadata but PostgreSQL authentication failed because `SUPABASE_DB_PASSWORD` is not available. No remote writes occurred. |
| Hosted lifecycle Playwright | **BLOCKED / NOT RUN** | Migration is not deployed; functions remain at prior versions; no dedicated real-MFA QA browser credentials were available in environment. |

Hosted safety gate result: `projects list` reported `hooemticmycoqhoccdsn` as the linked `Mini POS Licensing QA` project in `ap-southeast-1` and `ACTIVE_HEALTHY`; the QA health response included `sb-project-ref: hooemticmycoqhoccdsn`. CLI showed the new migration pending remotely. Production was not connected to or changed. The QA health probe itself returned expected unauthenticated `401`.
