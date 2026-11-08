# Licensing Removal Inventory
**Branch:** `feature/complete-licensing-removal`  
**Date:** 2026-10-30  
**Status:** Completed (All licensing components removed, all tests passing)

---

## 1. Repository Structure Summary

| Area | Path | Licensing Scope |
|------|------|----------------|
| Electron Main | `electron/main.ts` | Mixed — heavily licensing-dependent |
| Electron Preload | `electron/preload.ts` | Mixed — exposes licensing IPC |
| Electron Licensing Dir | `electron/licensing/` | 100% licensing-only |
| Electron IPC | `electron/ipc/licensing.handlers.ts` | 100% licensing-only |
| Electron Native | `electron/native/` | 100% licensing-only (device identity) |
| Renderer App Root | `src/App.tsx` | Mixed — has licensing gate |
| Licensing UI | `src/presentation/components/licensing/` | 100% licensing-only |
| Setup Activation | `src/presentation/components/setup/SetupActivationScreen.tsx` | 100% licensing-only |
| Settings Layout | `src/presentation/layouts/SettingsLayout.tsx` | Mixed — has licensing section |
| Licensing Store | `src/application/state/licensingStore.ts` | 100% licensing-only |
| Licensing Service | `src/application/use-cases/LicensingService.ts` | 100% licensing-only |
| Runtime Calculator | `src/application/use-cases/RuntimeCheckInStateCalculator.ts` | 100% licensing-only |
| Billing Service | `src/application/use-cases/BillingService.ts` | Mixed — licensing gate injected |
| Billing Auth Interface | `src/application/interfaces/IBillingAuthorization.ts` | 100% licensing-only |
| Local Auth Store Interface | `src/application/interfaces/ILocalAuthorizationStore.ts` | 100% licensing-only |
| Local Auth Store | `src/infrastructure/licensing/LocalAuthorizationStore.ts` | 100% licensing-only |
| Local Runtime Store | `src/infrastructure/licensing/LocalRuntimeStateStore.ts` | 100% licensing-only |
| Shared Crypto | `src/shared/crypto/` | Mixed — contains licensing-only and possibly shared |
| Licensing DTOs | `src/shared/licensing-dto.ts` | 100% licensing-only |
| IPC Contracts | `src/shared/ipc-contracts.ts` | Mixed — contains licensing IPC types |
| Admin UI App | `admin-ui/src/App.tsx` | Mixed — has license routes |
| Admin Sidebar | `admin-ui/src/components/Layout/Sidebar.tsx` | Mixed — has licenses nav |
| Admin Licenses | `admin-ui/src/pages/Licenses/` | 100% licensing-only |
| Admin Devices | `admin-ui/src/pages/Devices/` | Mixed — ReleaseBindingModal is licensing |
| Admin Dashboard | `admin-ui/src/pages/Dashboard.tsx` | Mixed — has license counts |
| Admin API Licenses | `admin-ui/src/api/licenses.ts` | 100% licensing-only |
| Admin API QA | `admin-ui/src/api/qaLicensing.ts` | 100% licensing-only |
| Admin Settings | `admin-ui/src/pages/Settings.tsx` | Mixed — has QA licensing settings |
| Backend API Function | `supabase/functions/api/index.ts` | 100% licensing-only |
| Backend Admin Function | `supabase/functions/admin/index.ts` | Mixed — has license/device/checkin routes |
| Backend Shared Services | `supabase/functions/_shared/services/` | Mixed |
| Backend Crypto | `supabase/functions/_shared/crypto/` | Mixed |
| Legacy Licensing Server | `server/licensing/` | 100% licensing-only (Express server) |
| Licensing Tests | `tests/licensing/` | 100% licensing-only |
| E2E Licensing Tests | `tests/e2e/licensing-real/` | 100% licensing-only |
| Supabase Tests | `tests/supabase/` | Mixed — many licensing tests |
| Integration Tests | `tests/integration/phase3c-*` | 100% licensing/backend-only |
| Vite Config | `vite.config.ts` | Mixed — embeds licensing public key |
| Env Files | `.env.local`, `.env.production` | Mixed — licensing env vars |

---

## 2. Complete File Inventory

### 2A. Files to DELETE (100% Licensing-Only)

#### Electron Layer
| File | Reason |
|------|--------|
| `electron/licensing/LicensingBillingGate.ts` | Exclusively the licensing billing enforcement gate |
| `electron/licensing/LicensingClient.ts` | HTTP client for licensing server only |
| `electron/licensing/LicensingLifecycleService.ts` | Handles license activation/deactivation |
| `electron/licensing/LicensingRuntimeService.ts` | Runtime licensing authority |
| `electron/licensing/RuntimeCheckInCoordinator.ts` | Orchestrates check-in protocol |
| `electron/licensing/__tests__/RuntimeCheckInCoordinator.integration.test.ts` | Licensing test |
| `electron/licensing/__tests__/RuntimeCheckInCoordinator.test.ts` | Licensing test |
| `electron/ipc/licensing.handlers.ts` | All licensing IPC handlers |
| `electron/native/IDeviceIdentityProvider.ts` | Interface for device identity (licensing-only) |
| `electron/native/NativeDeviceIdentityAdapter.ts` | macOS device identity for licensing |
| `electron/native/FakeDeviceIdentityProvider.ts` | Test double for device identity |
| `electron/native/MiniPOSIdentityHelper/` | Swift native helper (licensing device binding) |

#### Renderer Layer
| File | Reason |
|------|--------|
| `src/presentation/components/licensing/ActivationScreen.tsx` | License activation UI |
| `src/presentation/components/licensing/LicensingBanner.tsx` | License status banner |
| `src/presentation/components/setup/SetupActivationScreen.tsx` | Setup step requiring license activation |
| `src/application/state/licensingStore.ts` | Zustand store for licensing state |
| `src/application/use-cases/LicensingService.ts` | Application-layer licensing service |
| `src/application/use-cases/RuntimeCheckInStateCalculator.ts` | Check-in state computation |
| `src/application/interfaces/IBillingAuthorization.ts` | Licensing billing gate interface |
| `src/application/interfaces/ILocalAuthorizationStore.ts` | Local auth storage interface |
| `src/infrastructure/licensing/LocalAuthorizationStore.ts` | Reads/writes authorization.json |
| `src/infrastructure/licensing/LocalRuntimeStateStore.ts` | Reads/writes runtime_state.json |
| `src/infrastructure/licensing/__tests__/LocalRuntimeStateStore.test.ts` | Licensing test |
| `src/shared/crypto/AuthorizationPayload.ts` | Authorization envelope types |
| `src/shared/crypto/AuthorizationVerifier.ts` | Ed25519 signature verifier |
| `src/shared/crypto/RuntimeCheckinReceiptPayload.ts` | Check-in receipt types |
| `src/shared/crypto/RuntimeCheckinReceiptVerifier.ts` | Check-in receipt verifier |
| `src/shared/crypto/__tests__/RuntimeCheckinReceiptVerifier.test.ts` | Licensing crypto test |
| `src/shared/licensing-dto.ts` | Licensing status DTOs |

#### Admin UI Layer
| File | Reason |
|------|--------|
| `admin-ui/src/pages/Licenses/LicensesList.tsx` | License list page |
| `admin-ui/src/pages/Licenses/LicenseDetail.tsx` | License detail page |
| `admin-ui/src/pages/Licenses/LicenseModal.tsx` | License creation/edit modal |
| `admin-ui/src/pages/Licenses/LifecycleModal.tsx` | License lifecycle actions modal |
| `admin-ui/src/pages/Licenses/PlaintextKeyModal.tsx` | License key display modal |
| `admin-ui/src/pages/Licenses/__tests__/Licenses.test.tsx` | Licensing UI tests |
| `admin-ui/src/pages/Devices/ReleaseBindingModal.tsx` | Device binding release (licensing) |
| `admin-ui/src/api/licenses.ts` | License management API client |
| `admin-ui/src/api/qaLicensing.ts` | QA licensing settings API |
| `admin-ui/tests/licenses-*.spec.ts` | All 14 licensing Playwright tests |
| `admin-ui/tests/qa-licensing-settings.spec.ts` | QA licensing settings test |
| `admin-ui/tests/devices-release-binding.spec.ts` | Device binding release test |

#### Backend (Supabase Functions)
| File | Reason |
|------|--------|
| `supabase/functions/api/index.ts` | Entirely licensing API (activation, deactivation, check-in) |
| `supabase/functions/_shared/crypto/ChallengeService.ts` | Licensing challenge crypto |
| `supabase/functions/_shared/crypto/RuntimeChallengeService.ts` | Runtime check-in challenge |
| `supabase/functions/_shared/crypto/authorization.ts` | Authorization signing |
| `supabase/functions/_shared/crypto/deviceProof.ts` | Device proof verification |
| `supabase/functions/_shared/crypto/licenseKey.ts` | License key HMAC |
| `supabase/functions/_shared/errors/CryptoError.ts` | Crypto error class |
| `supabase/functions/_shared/protocol/AuthorizationPayload.ts` | Authorization protocol types |
| `supabase/functions/_shared/protocol/DeviceChallenge.ts` | Device challenge types |
| `supabase/functions/_shared/services/ActivationService.ts` | License activation |
| `supabase/functions/_shared/services/AdminCheckinService.ts` | Admin check-in management |
| `supabase/functions/_shared/services/AdminDeviceService.ts` | Device management (licensing) |
| `supabase/functions/_shared/services/AdminDirectiveService.ts` | Runtime directives |
| `supabase/functions/_shared/services/AdminLicenseService.ts` | License CRUD |
| `supabase/functions/_shared/services/AdminLifecycleService.ts` | License lifecycle |
| `supabase/functions/_shared/services/AuditService.ts` | Check if shared or licensing-only |
| `supabase/functions/_shared/services/DeactivationService.ts` | License deactivation |
| `supabase/functions/_shared/services/QaLicensingSettingsService.ts` | QA licensing settings |
| `supabase/functions/_shared/services/RuntimeCheckinService.ts` | Runtime check-in service |
| `supabase/functions/tests/runtime-checkin-regression.test.ts` | Check-in regression test |
| `supabase/functions/tests/savepoint-regression.test.ts` | Savepoint test (check if licensing) |

#### Standalone Licensing Server
| Directory | Reason |
|-----------|--------|
| `server/licensing/` | Entire standalone Express licensing server |

#### Tests
| Directory/File | Reason |
|----------------|--------|
| `tests/licensing/` | All licensing unit/integration tests |
| `tests/e2e/licensing-real/` | All licensing E2E tests |
| `tests/supabase/` | All Supabase licensing tests |
| `tests/integration/device-aal2.test.ts` | Device authentication level 2 |
| `tests/integration/device-backend-rbac.test.ts` | Device backend RBAC |
| `tests/integration/phase3c-*.test.ts` | All Phase 3C licensing backend tests |

#### Miscellaneous Scripts
| File | Reason |
|------|--------|
| `generate_test_license.js` | Generates test license keys |
| `get_pub_key.js` | Extracts public key for licensing (deleted) |

---

### 2B. Files to MODIFY (Mixed — Remove Licensing Portions)

| File | What to Remove |
|------|---------------|
| `electron/main.ts` | All licensing imports, LICENSING SUBSYSTEM block, billing gate wiring, powerMonitor resume hook |
| `electron/preload.ts` | The `licensing:` section of the IPC API object |
| `src/shared/ipc-contracts.ts` | `licensing:` section of `IpcApi` type, `LicensingStatusDTO` import |
| `src/application/use-cases/BillingService.ts` | `billingAuth` param, `setBillingAuth()`, gate check in `finalizeBill()` |
| `src/App.tsx` | `useLicensingStore`, `ActivationScreen`, `LicensingBanner`, licensing check |
| `src/presentation/layouts/SettingsLayout.tsx` | Licensing section, deactivate controls, simulate-offline toggle, licensingRef |
| `src/presentation/components/setup/SetupCompleteScreen.tsx` | If contains "license active" text |
| `admin-ui/src/App.tsx` | License routes (`/licenses`, `/licenses/:id`) |
| `admin-ui/src/components/Layout/Sidebar.tsx` | Licenses navigation entry, Key icon |
| `admin-ui/src/pages/Dashboard.tsx` | License count cards (active_licenses, revoked_licenses, active_bindings, recent_checkins, overdue_checkins) |
| `admin-ui/src/pages/Devices/DevicesList.tsx` | License binding columns/sections |
| `admin-ui/src/pages/Devices/DeviceDetail.tsx` | License binding sections |
| `admin-ui/src/api/types.ts` | Licensing-specific types |
| `admin-ui/src/pages/Settings.tsx` | QA licensing settings section |
| `admin-ui/src/pages/AuditLogs.tsx` | If it references licensing audit events specifically |
| `supabase/functions/admin/index.ts` | All license/device-binding/checkin/directive routes |
| `vite.config.ts` | `__PROD_LICENSING_SERVER_PUBLIC_KEY__` define, licensing test env vars |
| `.env.local` | All `VITE_LICENSING_*` and `LICENSING_*` variables |
| `.env.production` | All `VITE_LICENSING_*` and `LICENSING_*` variables |
| `electron-builder.yml` | `extraResources` for native helper (if assets/native is now empty) |
| `package.json` | `dev:qa` script (licensing QA server), licensing test env vars in vitest config |
| `scripts/prebuild-check.js` | No changes needed — it's about build path spaces only |

---

## 3. IPC Methods Removed

| IPC Channel | Direction | Purpose |
|-------------|-----------|---------|
| `license:getState` | Renderer → Main | Get licensing state |
| `license:activate` | Renderer → Main | Activate license |
| `license:deactivate` | Renderer → Main | Deactivate license |
| `license:verifyNow` | Renderer → Main | Manual check-in |
| `license:setSimulateOffline` | Renderer → Main | QA test hook |
| `license:getSimulateOffline` | Renderer → Main | QA test hook |
| `license:stateChanged` | Main → Renderer | Push state change event |

---

## 4. Backend Routes Removed

### api function (entire function removed — all licensing):
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/challenge` | Get device challenge |
| POST | `/api/activate` | Activate license |
| POST | `/api/deactivate` | Deactivate license |
| POST | `/api/checkin/challenge` | Get check-in challenge |
| POST | `/api/checkin` | Submit check-in |

### admin function (licensing routes removed, customers/audit kept):
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/admin/licenses` | License management |
| GET/PUT/DELETE | `/admin/licenses/:id` | License CRUD |
| POST | `/admin/licenses/:id/extend` | License extension |
| POST | `/admin/licenses/:id/suspend` | License suspension |
| POST | `/admin/licenses/:id/restore` | License restoration |
| POST | `/admin/licenses/:id/revoke` | License revocation |
| GET | `/admin/devices` | Device listing (binding-only) |
| GET | `/admin/devices/:id` | Device detail |
| POST | `/admin/devices/:id/release-binding` | Release device binding |
| GET | `/admin/checkins` | Check-in listing |
| POST | `/admin/directives` | Create directive |
| GET | `/admin/qa/licensing-settings` | QA licensing settings |
| PUT | `/admin/qa/licensing-settings` | QA licensing settings |

---

## 5. Database Objects Scheduled for Decommissioning

### Exclusively Licensing Tables (safe to drop after data retention decision):
- `licenses`
- `license_bindings`
- `devices`
- `activation_requests`
- `lifecycle_requests`
- `device_challenges`
- `runtime_checkin_challenges`
- `runtime_checkin_requests`
- `runtime_checkins`
- `runtime_directives`
- `runtime_directive_deliveries`
- `qa_licensing_settings` (if created by migration 20261006000000)

### Mixed Tables (retain — non-licensing data):
- `customers` — used by Admin Panel customer management
- `admin_roles` — used by Admin Panel auth
- `audit_events` — used by Admin Panel audit log (contains licensing events but also admin events)

### Triggers to Drop:
- `check_license_customer_not_sentinel` trigger on `licenses` table

### See: `docs/licensing-database-decommission.md` for full strategy.

---

## 6. Environment Variables to Remove

| Variable | Location |
|----------|----------|
| `VITE_LICENSING_SERVER_URL` | `.env.local`, `.env.production`, vite.config.ts |
| `VITE_LICENSING_SERVER_KEY_ID` | `.env.local`, `.env.production` |
| `VITE_LICENSING_SERVER_PUBLIC_KEY` | `.env.local`, `.env.production` |
| `LICENSING_SERVER_PUBLIC_KEY` | `.env.local`, `.env.production`, vite.config.ts define |
| `LICENSING_SERVER_KEY_ID` | `.env.local`, `.env.production` |
| `LICENSING_SERVER_URL` | `package.json` dev:qa script |
| `LICENSING_SERVER_PRIVATE_KEY` | Supabase Edge Function env (external — not in repo) |
| `LICENSE_KEY_HMAC_SECRET` | `vite.config.ts` test env |
| `ADMIN_API_TOKEN` | `vite.config.ts` test env (check if used elsewhere) |
| `DATABASE_URL` | `vite.config.ts` test env (licensing PostgreSQL) |
| `MINIPOS_E2E_TEST` | `electron/main.ts` (partially — kept for dialog service) |

---

## 7. Classification Summary

| Category | Count |
|----------|-------|
| Files to delete (100% licensing) | ~70 |
| Files to modify (licensing portions) | ~20 |
| IPC channels removed | 7 |
| Backend routes removed | ~18 |
| DB tables for decommission | 11 |
| DB tables to retain | 3 |
| Env variables removed | 10 |

---

## 8. Preserved Non-Licensing Functionality

The following remains intact:
- All POS billing operations (product add, draft management, finalization)
- All product management (CRUD, barcode)
- All printing (receipt, PDF export)
- All history/sales history
- All settings (store profile, printer config)
- All backup/restore
- Setup wizard (store profile onboarding — licensing activation step removed)
- Admin Panel: Customer management, Audit Logs, general authentication/RBAC
- Supabase admin function: Customer CRUD routes, Dashboard (license counts removed), Audit routes

---

*See `docs/licensing-removal-architecture.md` for architecture diagrams.*  
*See `docs/licensing-database-decommission.md` for database strategy.*

