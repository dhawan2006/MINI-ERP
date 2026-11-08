# Licensing System Audit — Phase A Discovery

**Date:** 2026-10-28  
**Branch:** `stabilization/production-hardening`  
**Scope:** licensing admin UI, Supabase licensing services and schema, desktop licensing/identity path, and existing verification assets. No implementation or remote operation was performed for this audit.

## Executive summary

The repository contains two licensing server implementations: the current Supabase Edge Function path (`supabase/functions`) and a Node/Express licensing service (`server/licensing`). The admin UI and Electron client are separate surfaces. The admin UI manages license records and administrative lifecycle; the Electron main process performs device-bound activation, online deactivation, receipt check-in, and local authorization verification. The current desktop source treats check-in expiry as a billing-blocking state even though runtime-service comments and protocol documentation say no offline lease/grace period exists. This is a verified policy/documentation inconsistency and needs a product decision before altering expected behavior.

Hosted QA target configured in local Supabase link metadata is `hooemticmycoqhoccdsn` (`Mini POS Licensing QA`); production ref in existing repository records is `rmkosqdgltiimdhpmrsk` and is out of scope. The hosted target was not independently queried during this discovery because this environment previously returned a DNS resolution failure. No remote write/deploy was attempted. The checkout has extensive pre-existing modified and untracked files; preserve them.

## Architecture inventory

| Area | Relevant files | Observed responsibility |
|---|---|---|
| Admin UI | `admin-ui/src/App.tsx`, `pages/Licenses/*`, `pages/Devices/*`, `api/*`, `store/authStore.ts` | Authenticated React panel; customer/license/device list/detail; license issue and admin extension/disable/restore/revoke; device binding release; Supabase Auth session and `/admin/me` context. |
| Admin server | `supabase/functions/admin/index.ts`, `_shared/http/Router.ts`, `_shared/middleware/adminAuth.ts` | Role/MFA-checked admin routes; idempotency handling; lifecycle operations; service-role database transactions. |
| Runtime server | `supabase/functions/api/index.ts`, `_shared/services/{ActivationService,DeactivationService,RuntimeCheckinService}.ts`, crypto/protocol modules | Challenge/proof flows; license lookup and device binding; signed activation authorization and signed check-in receipt. |
| Legacy/currently parallel server | `server/licensing/src/routes/*`, `services/*`, `crypto/*` | Node/Express activation, deactivation, check-in and administration implementation. Must be compared with Edge Function behavior before deciding which is canonical for each target. |
| Database | `supabase/migrations/*.sql` | License/customer/device/binding tables; activation and lifecycle request idempotency; runtime challenges/requests/receipts/directives; RLS and tenant-scope hardening; audit trail/indexes. |
| Electron main / IPC | `electron/main.ts`, `electron/ipc/licensing.handlers.ts`, `electron/licensing/*`, `electron/preload.ts`, `src/shared/ipc-contracts.ts` | Main-process licensing authority, device identity integration, network workflows, local state and narrow renderer IPC. Renderer can request activation/deactivation/verify and read a safe status DTO; it cannot set license state. |
| Renderer and local policy | `src/application/use-cases/LicensingService.ts`, `src/shared/crypto/*`, `src/presentation/components/licensing/*`, `electron/licensing/LicensingBillingGate.ts` | Signature/device/time checks, activation/expired/check-in UI states, and fail-closed billing authorization gate. |
| Hardware identity | `electron/native/NativeDeviceIdentityAdapter.ts`, `electron/native/MiniPOSIdentityHelper/Sources/MiniPOSIdentityHelper/*` | Swift helper uses Secure Enclave P-256 key material and Keychain; only public identity and signatures cross to Electron. Hardware behavior was not exercised in this discovery. |
| Tests/config | root `playwright.config.ts`, `tests/e2e/licensing-real/*`, `admin-ui/playwright.config.ts`, `admin-ui/tests/*`, Vitest suites | Root Playwright drives Electron E2E and marks `MINIPOS_E2E_TEST`; admin-ui Playwright config points at local Supabase and mocks auth/API in lifecycle specs. Existing hosted specs include synthetic AAL2 assumptions. |

## Confirmed behavior and findings

### Verified from source

1. **Admin and desktop licensing paths are distinct.** Admin UI issuance and lifecycle mutations call authenticated `/admin/*` routes. Desktop activation/deactivation/check-in call the licensing runtime endpoints and use device cryptographic proofs. Admin UI success does not itself establish a desktop activation.
2. **License expiry is authoritative server time in activation.** Both Node and Edge activation implementations require `valid_from <= now < valid_until`; license expiry is embedded in a signed authorization. Client-side `AuthorizationVerifier` checks Ed25519 signature, key ID, protocol versions, and canonicalized payload. `LicensingService` checks its time and device context.
3. **Activation binds a device transactionally and enforces device capacity.** Both server implementations lock the license, count active bindings, and enforce a unique active device binding. A device already bound to another license is automatically deactivated and rebound in the activation flow (seamless renewal path); validate this policy explicitly in QA because it differs from admin release flow.
4. **Admin disable, restore, revoke, and release are separate mutations.** Admin lifecycle actions require configured roles/MFA in Router options; service methods perform scoped queries, database updates, and audit writes. Revocation deactivates its active bindings; disabling/restoring does not have the same documented binding behavior. The UI text says restore returns the license to ACTIVE.
5. **End-user deactivation is online and proof-based.** Electron requests a challenge, signs it with the device identity, posts deactivation, and clears local authorization only on success. Network failure is surfaced as a failure; there is no verified immediate remote control of an offline device.
6. **Runtime check-in creates a signed receipt with a seven-day validity cap.** Both `server/licensing/src/services/RuntimeCheckinService.ts` and `supabase/functions/_shared/services/RuntimeCheckinService.ts` calculate `now + 7 days`, capped at `license.valid_until`. The receipt includes `checkInValidUntil`, `licenseValidUntil`, and license status.
7. **Desktop enforces check-in expiry separately from authorization expiry.** `RuntimeCheckInCoordinator` verifies signed receipt/license/device, stores it, and reports overdue after `checkInValidUntil`; `LicensingRuntimeService` transitions to `CHECKIN_OVERDUE`; `LicensingBillingGate` permits only `ACTIVE`. `LicensingBanner` says billing is disabled after 7 days without verification.
8. **Policy comments were inconsistent; the intended behavior is now clarified.** The user confirmed the seven-day signed check-in lease and billing block. The contradictory runtime comments and UI wording were aligned locally. This policy choice does not certify runtime behavior; hosted validation remains outstanding.
9. **No server-enforced accelerated QA settings exist.** The lease duration is hard-coded in both runtime services. The admin UI has no QA policy controls, and browser-only settings cannot change signed server receipts. This is a confirmed feature gap, not a runtime failure test.
10. **Tenant isolation is enforced in current admin services.** The modified working tree contains customer-scope checks in admin services and migrations; lifecycle queries join the license to customer scope before mutation and return not-found for foreign resources. Full tenant-isolation certification remains blocked per user instruction and governance records.
11. **Current admin Playwright config is local.** `admin-ui/playwright.config.ts` hard-codes `127.0.0.1:54321`; lifecycle UI specs mock auth and `/admin/*`. They do not constitute hosted database/UI certification. Several `licenses-mfa-success-*` specs build synthetic AAL2 JWTs; repository history records that hosted Supabase rejects these.
12. **QA ref source is local link metadata, not live metadata.** `supabase/.temp/project-ref` and `linked-project.json` identify the QA ref; `supabase/config.toml` names a local project (`mini_ERP`). Existing QA reports state QA and production refs. No remote changes are allowed until authoritative hosted identity is independently checked.

### Verified defect / risk register

| ID | Severity | Finding | Evidence | Phase A assessment |
|---|---|---|---|---|
| AUD-01 | P1 pending policy decision | Runtime lease semantics conflict with the “no lease/no grace” runtime invariants. The implemented path blocks billing after a seven-day signed check-in expiry. | `electron/licensing/LicensingRuntimeService.ts` SEC-RT-007/008 vs. `RuntimeCheckInCoordinator.ts`, `LicensingBillingGate.ts`, `LicensingBanner.tsx`, both server `RuntimeCheckinService.ts` files, `docs/runtime-checkin-protocol-v1.md`. | Confirmed policy/documentation inconsistency. Product decision required; do not silently change behavior. |
| AUD-02 | P1 test blocker | Admin panel cannot select a short license duration and server cannot issue a configurable short signed offline lease. | `admin-ui/src/pages/Licenses/LicenseModal.tsx`; both runtime service implementations hard-code 7 days. | Confirmed gap; smallest safe design is server-enforced QA-only setting, disabled by default and restricted to verified QA ref, with audit and tests. No implementation in Phase A. |
| AUD-03 | P1 test blocker | Existing admin Playwright project targets local Supabase; lifecycle UI tests use route mocks. Hosted specs relying on synthetic AAL2 cannot prove real hosted mutation flows. | `admin-ui/playwright.config.ts`, `admin-ui/tests/licenses-lifecycle.spec.ts`, `admin-ui/tests/licenses-real-integration.spec.ts`. | Confirmed test architecture gap; require separate hosted QA project/config with exact-ref deny guard and real MFA user. |
| AUD-04 | P2 behavior decision | Automatic binding migration during activation may deactivate the device’s prior active binding; admin UI release is a separate action. | Node and Edge `ActivationService` unique-active-device-binding recovery branches. | Behavior exists; clarify supported assignment/reassignment semantics and audit expectations. |
| AUD-05 | P2 evidence gap | Existing source and reports do not establish current hosted behavior or actual Secure Enclave/device-restart behavior for this working tree. | Local-only Playwright config; prior reports identify older deployment commit; macOS Swift helper implementation. | Not a source defect finding. Requires hosted QA and suitable macOS hardware; no claim of coverage. |

## Areas not verified in Phase A

- Current live project identity/region/function versions/schema migration state; DNS was unavailable in the previous preflight and the Supabase CLI is not installed as a command.
- Any hosted request, real QA Auth/MFA flow, database mutation, migration, or deployed function behavior.
- Current admin panel against a real QA backend and database.
- Actual Electron app activation, Secure Enclave private-key operation, Keychain persistence, OS restart, offline lease expiry, or device reassignment. Existing tests do not substitute for physical hardware validation.
- Product decisions for exact expiry inclusivity, expired-license extension policy, disabled-license binding policy, and whether check-in expiry is intended to block billing.
- Whether all current working-tree edits are mutually consistent; the tree contains many pre-existing modifications/untracked files. The audit did not reset or normalize it.

## Phase B/C implementation and remaining Phase D work

1. Policy semantics are resolved as a seven-day lease with billing blocked after lease expiry.
2. QA-only server/database settings and admin controls were implemented locally, with exact QA host guard, bounded presets, disabled default, Support+AAL2 mutation, audit, QA banner, and reset behavior.
3. The Node/Express and Supabase Edge check-in implementations both honor the setting only on the exact QA host while enabled; otherwise they retain seven days.
4. Hosted Playwright execution still requires the pending QA migration, deployment of reviewed Edge code, real Support+AAL2 credentials, and dedicated QA fixtures. No hosted scenario was run in this phase.
5. Desktop hardware-backed identity, Keychain persistence, and restart scenarios remain separately unverified.

## Governance

Option B remains implemented; formal Product Owner approval is unverified, and full tenant-isolation certification remains blocked. This audit does not certify the product or authorize production changes.

## Phase B/C implementation addendum — 2026-10-28

Product clarified that the seven-day offline lease and billing block are intended. Runtime comments and UI copy have been aligned to that policy. Local code now includes a QA-only setting table/API/UI with exact QA project-ref gating, Support+AAL2 mutation control, bounded license/lease presets, server-clock expiry calculation, audit event, and reset-to-default behavior. The Edge and Node check-in services honor the stored QA lease only when configured for the exact QA host; all other hosts keep the seven-day value. License detail now displays binding and signed lease timestamps, and newly issued licenses display server-returned start/expiry. Admin lifecycle mutation guards reject extending revoked licenses, reducing expiry through an extend request, or disabling a revoked license.

This is local implementation only. Migration `20261006000000` is pending remotely. QA project CLI metadata and gateway header both identify `hooemticmycoqhoccdsn`, but remote migration dry-run could not authenticate to Postgres because `SUPABASE_DB_PASSWORD` is unavailable. No migration/function deployment or hosted lifecycle test was performed. See `docs/licensing-qa-run-report.md`.

The findings above marked as gaps describe the Phase A baseline; implementation details and current execution status are in the addendum and run report.
