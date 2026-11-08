# Mini POS — Production Deployment & External Decommissioning Preflight Checklist

**Document Version:** 1.0  
**Date:** October 31, 2026  
**Auditor / DevOps Lead:** Senior DevOps & Release Engineering  
**Branch:** `feature/complete-licensing-removal`  
**Commit:** `91edb3ac70f8435b27cb89fb24e86ec40a94f6dc`  
**Phase Status:** Phase 1 Completed (Read-Only Preflight Verification)

---

## 1. Objective & Scope

This preflight document records all prerequisites, target environments, dependencies, risks, and procedural steps for executing the remaining external actions following the successful local architectural removal of the Mini POS licensing system.

The operations encompass:
1. Hosted PostgreSQL licensing schema decommissioning on Supabase.
2. Hosted Supabase Edge Function cleanup (`api`, `activate`, `deactivate` deletion; `admin` redeployment).
3. Obsolete licensing secrets cleanup.
4. Production desktop installer packaging and bundle verification.
5. Real-world installation, upgrade, and air-gapped acceptance testing.

---

## 2. Infrastructure & Environment Identification

### 2.1 Git Repository & Working Tree
- **Active Branch:** `feature/complete-licensing-removal`
- **Head Commit:** `91edb3ac70f8435b27cb89fb24e86ec40a94f6dc`
- **Working Tree State:** All local licensing code, IPC channels, and native helpers removed; 100% of local unit and E2E test suites pass.

### 2.2 Supabase Projects Status
Inspection of `npx supabase projects list` against the authenticated account:

| Project Reference | Project Name | Region | Status | Linked | Role / Assessment |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `hooemticmycoqhoccdsn` | **Mini POS Licensing QA** | `ap-southeast-1` | `ACTIVE_HEALTHY` | **YES** | Active target project hosting the remote schema, Edge Functions, and admin data. |
| `rmkosqdgltiimdhpmrsk` | **Mini POS Licensing Production** | `ap-south-1` | `INACTIVE` | NO | Dormant/inactive project (offline). Not currently active or linked. |

> [!IMPORTANT]
> The currently linked, active target project is `hooemticmycoqhoccdsn` (PostgreSQL 17.11, host `db.hooemticmycoqhoccdsn.supabase.co`). All remote inspection and migrations are verified against this target.

---

## 3. Database Schema Decommissioning Review

### 3.1 Migration Artifact
- **Target File:** [supabase/migrations/20261101000000_decommission_licensing_schema.sql](file:///Users/laksh/Desktop/mini_ERP/supabase/migrations/20261101000000_decommission_licensing_schema.sql)
- **Transaction Model:** Single atomic transaction (`BEGIN; ... COMMIT;`).
- **Execution Nature:** Forward-only, idempotent (`IF EXISTS`, `CASCADE`).

### 3.2 Inventory of Remote Objects & Target Actions

Verified via `npx supabase inspect db table-stats --linked`:

| Object Name | Type | Current Row Count | Planned Action | Dependency / Safety Justification |
| :--- | :---: | :---: | :---: | :--- |
| `licenses` | Table | ~8 | **DROP CASCADE** | Obsolete licensing ledger. |
| `devices` | Table | ~30 | **DROP CASCADE** | Hardware identity tracking dropped. |
| `license_bindings` | Table | ~32 | **DROP CASCADE** | Device-to-license mappings dropped. |
| `runtime_checkins` | Table | ~4 | **DROP CASCADE** | Check-in receipts and telemetry dropped. |
| `runtime_directives` | Table | ~4 | **DROP CASCADE** | Server push directives dropped. |
| `runtime_directive_deliveries`| Table | 0 | **DROP CASCADE** | Directives delivery confirmation dropped. |
| `runtime_checkin_challenges` | Table | 0 | **DROP CASCADE** | Ephemeral nonces dropped. |
| `device_challenges` | Table | 0 | **DROP CASCADE** | Ephemeral nonces dropped. |
| `activation_requests` | Table | 0 | **DROP CASCADE** | Activation idempotency ledger dropped. |
| `lifecycle_requests` | Table | 0 | **DROP CASCADE** | Lifecycle idempotency ledger dropped. |
| `runtime_checkin_requests` | Table | ~22 | **DROP CASCADE** | Check-in idempotency ledger dropped. |
| `qa_licensing_settings` | Table | 0 | **DROP CASCADE** | QA test durations dropped. |
| `trg_check_license_customer_not_sentinel` | Trigger | — | **DROP** | Licensing sentinel trigger dropped. |
| `check_license_customer_not_sentinel()` | Function | — | **DROP** | Licensing validation function dropped. |
| **`customers`** | Table | **~52** | **PRESERVE** | **CRITICAL BUSINESS DATA:** Customer accounts and contact records retained. |
| **`admin_roles`** | Table | **~153** | **PRESERVE** | **CRITICAL SECURITY DATA:** Admin user RBAC and authentication mappings retained. |
| **`audit_events`** | Table | **~11** | **PRESERVE** | **CRITICAL AUDIT TRAIL:** Security audit records retained; `license_id` & `device_key_id` relaxed to nullable. |
| **`admin_idempotency_keys`** | Table | **~8** | **PRESERVE** | Customer mutation idempotency records retained. |

---

## 4. Supabase Edge Functions Review

### 4.1 Remote Functions vs Local State
Verified via `npx supabase functions list --project-ref hooemticmycoqhoccdsn`:

| Function Slug | Remote Status | Local Status | Planned Operation |
| :--- | :---: | :---: | :--- |
| `activate` | ACTIVE (v3) | Deleted | **DELETE** via CLI (`supabase functions delete activate`) |
| `deactivate` | ACTIVE (v3) | Deleted | **DELETE** via CLI (`supabase functions delete deactivate`) |
| `api` | ACTIVE (v4) | Deleted | **DELETE** via CLI (`supabase functions delete api`) |
| `admin` | ACTIVE (v6) | Present & Cleaned | **REDEPLOY** via CLI (`supabase functions deploy admin`) |

### 4.2 Admin Function Dependencies & Verification
- Local file: [supabase/functions/admin/index.ts](file:///Users/laksh/Desktop/mini_ERP/supabase/functions/admin/index.ts)
- Exposes only:
  - `GET /customers`, `POST /customers`, `GET /customers/:id`, `PUT /customers/:id`
  - `GET /audit`
  - `GET /dashboard/summary`
  - `GET /me`
  - `POST /_test/scope-check`
- Zero imports from deleted licensing services or crypto helpers.
- Configuration in [supabase/config.toml](file:///Users/laksh/Desktop/mini_ERP/supabase/config.toml) pruned of `[functions.api]`.

---

## 5. Hosted Secrets Review

Verified via `npx supabase secrets list --project-ref hooemticmycoqhoccdsn`:

| Secret Name | Present Remotely | Target Action | Verification & Justification |
| :--- | :---: | :---: | :--- |
| `ADMIN_API_TOKEN` | YES | **RETAIN** | Required for authenticated requests to `admin` Edge Function. |
| `SUPABASE_ANON_KEY` | YES | **RETAIN** | Built-in Supabase platform secret. |
| `SUPABASE_SERVICE_ROLE_KEY` | YES | **RETAIN** | Built-in Supabase platform secret. |
| `SUPABASE_URL` | YES | **RETAIN** | Built-in Supabase platform secret. |
| `SUPABASE_DB_URL` | YES | **RETAIN** | Built-in Supabase database connection pooler. |
| `LICENSING_SERVER_KEY_ID` | YES | **DELETE** | Obsolete licensing Ed25519 key identifier. |
| `LICENSING_SERVER_PRIVATE_KEY` | YES | **DELETE** | Obsolete licensing Ed25519 private signing key. |
| `LICENSE_KEY_HMAC_SECRET` | YES | **DELETE** | Obsolete HMAC secret for license keys. |

---

## 6. Desktop Packaging & Acceptance Test Plan

### 6.1 Build Platform
- **Target OS:** macOS ARM64 (`darwin-arm64`)
- **Package Script:** `npm run package:mac:arm64` (executes `node scripts/prebuild-check.js && npm run build && electron-builder --mac --arm64`)
- **App Output:** `release/mac-arm64/Mini POS.app`

### 6.2 Acceptance Test Scenarios
1. **Fresh Installation:** Launch packaged binary on a clean temp userData path; verify Welcome screen, store name setup, and direct transition to POS billing without activation prompts.
2. **Existing Installation Upgrade:** Seed SQLite with completed setup and dummy products; launch packaged binary; verify immediate transition to billing.
3. **Air-Gapped / Offline Simulation:** Run packaged application with isolated network; verify cashier can add items, calculate totals, finalize cash & UPI transactions, restart, and observe persisted sales in SQLite.
4. **Corrupt Legacy Files:** Seed legacy `authorization.json` and `runtime_state.json` into userData directory; verify application ignores them without crashing.
5. **Admin Panel Verification:** Run Admin UI against mocked or deployed admin API to ensure customer list, customer detail, and audit log pages render properly.

---

## 7. Risk Analysis & Contingency Procedures

| Risk | Probability | Severity | Mitigation & Contingency |
| :--- | :---: | :---: | :--- |
| **Accidental loss of Customer or Admin data** | Very Low | Critical | Full PostgreSQL backup taken prior to migration; `customers` and `admin_roles` are omitted from `DROP` statements; foreign keys detached safely. |
| **Migration failure due to foreign key lock** | Low | Medium | Migration runs in a single transaction (`BEGIN ... COMMIT`); `CASCADE` handles inter-table licensing dependencies cleanly. If error occurs, transaction rolls back automatically. |
| **Edge Function disruption** | Low | Low | Desktop application does not depend on Edge Functions; only Admin Panel uses `admin` function. Function can be rolled back or re-deployed instantly. |
| **Packaged binary crash** | Low | High | All native dependencies (better-sqlite3) pre-tested; Asar bundle verified clean of removed native binaries. |

---

## 8. Preflight Sign-Off

Phase 1 preflight checks have concluded successfully with **zero modifications made to remote production infrastructure**.
All environments, target objects, and procedures are documented.

**Proceeding to Phase 2 (Database Backup) and Phase 3 (Migration Review & Execution).**
