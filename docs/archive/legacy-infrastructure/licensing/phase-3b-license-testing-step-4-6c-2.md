# Phase 3B — License Testing Step 4.6C.2

## Successful AAL2 License Disable Certification

> **This step verifies successful Disable authorization and execution using
> SYNTHETIC_QA_AAL2. It does not certify real Supabase TOTP enrollment or
> production MFA.**

---

## 1. Contract Audit (from source)

### Endpoint
```
POST /functions/v1/admin/lifecycle/disable-license
```

### Permitted Roles (from `supabase/functions/admin/index.ts`)
```
['OWNER', 'ADMIN', 'SYSTEM']
```
`SYSTEM` is a programmatic role with no human login path. Human roles tested: `OWNER`, `ADMIN`.

### `requireMfa`
```
true
```
AAL2 is enforced by `adminAuth.ts` for all requests to this endpoint.

### Request Body
```json
{
  "licenseId": "<uuid>",
  "reason": "<non-empty string>"
}
```
Both fields required. Server returns `INVALID_REQUEST` if either is absent.

### Response (success)
```json
{ "status": "SUCCESS" }
```
HTTP 200.

### Starting State
Any state except `DISABLED`. Service returns `ALREADY_DISABLED` if license is already disabled.  
UI (`LicenseDetail.tsx`) shows the `Disable` button **only** when `license.status === 'ACTIVE'`.  
Test fixtures create fresh `ACTIVE` licenses as starting state.

### Resulting State
`DISABLED`

Side effects:
- All active `license_bindings` for the license are set to `DEACTIVATED`
- Audit event `ADMIN_DISABLE_LICENSE` is recorded with `reason`

### Idempotency
`X-Idempotency-Key` header is required. The `LifecycleModal` generates a fresh `crypto.randomUUID()` on each submit.

### Audit Reason
`reason` is required server-side (`INVALID_REQUEST` if absent) and client-side (HTML5 `required` on `input#reason`).

### Post-Disable State Machine (UI)
After successful Disable:
- `Disable` button: hidden (only shown for `ACTIVE`)
- `Restore` button: visible (shown for `DISABLED`)
- `Revoke` button: visible (shown for all non-`REVOKED` states)

---

## 2. AAL2 Methodology — SYNTHETIC_QA_AAL2

1. Authenticate to Supabase via password grant (real Supabase session)
2. Extract the JWT payload
3. Mutate `payload.aal = 'aal2'`
4. Re-sign with the local QA `JWT_SECRET` (`super-secret-jwt-token-with-at-least-32-characters-long`)
5. Inject the re-signed token into the UI browser context via `page.route` mock on the auth token endpoint

This is **NOT** a real Supabase TOTP flow. It proves the `requireMfa` middleware correctly accepts a JWT carrying `aal: 'aal2'` signed with the trusted QA key.

---

## 3. Test File

```
admin-ui/tests/licenses-mfa-success-disable.spec.ts
```

Separate from all other test files. Contains two describe blocks:

1. **`Successful AAL2 License Disable (Step 4.6C.2)`** — OWNER and ADMIN roles
2. **`Disable button absent for non-ACTIVE license (state machine UX)`** — OWNER invalid-starting-state check

---

## 4. Test Results

### Step 4.6C.2 — Successful Disable

| Check | Result |
|---|---|
| OWNER + SYNTHETIC_QA_AAL2 Disable | **PASS** |
| ADMIN + SYNTHETIC_QA_AAL2 Disable | **PASS** |
| Starting state verified ACTIVE | **PASS** |
| Disable button visible for ACTIVE | **PASS** |
| Disable modal opened | **PASS** |
| Empty reason blocked (client validation) | **PASS** |
| Authorization header `Bearer …` present | **PASS** |
| X-Idempotency-Key present | **PASS** |
| Request payload `licenseId` correct | **PASS** |
| Request payload `reason` correct | **PASS** |
| No `valid_until` in payload | **PASS** |
| Server accepted request (modal closed) | **PASS** |
| Authoritative GET → `status: DISABLED` | **PASS** |
| UI shows DISABLED status badge | **PASS** |
| Disable button hidden after success | **PASS** |
| Restore button visible after success | **PASS** |
| Revoke button visible after success | **PASS** |
| Full page reload → DISABLED persists | **PASS** |
| Duplicate-submit prevention | **PASS** (static `disabled={loading}` on submit) |
| Invalid starting state UX (DISABLED → no Disable btn) | **PASS** |
| Unexpected page errors | **0** |

---

## 5. Regression Results

| Suite | Result |
|---|---|
| Step 4.6C.2 (licenses-mfa-success-disable.spec.ts) | **3/3 PASS** |
| Step 4.6C.1 (licenses-mfa-success-extend.spec.ts) | **2/2 PASS** |
| Step 4.6B (licenses-mfa-success-create.spec.ts) | **3/3 PASS** |
| Step 4.6A (licenses-mfa-negative.spec.ts) | **9/9 PASS** |
| Step 4.5B (licenses-rbac-api.spec.ts) | **15/15 PASS, 1 skipped** |
| Step 4.5A (licenses-rbac-ui.spec.ts) | **10/11 PASS** (\*) |
| Step 4.4 (licenses-security-browser.spec.ts) | **10/10 PASS** |
| Step 4.3 (licenses-lifecycle.spec.ts) | **25/25 PASS** |
| Step 4.2 (licenses-create.spec.ts) | **PASS** |
| Step 4.1 (licenses-read.spec.ts) | **7/7 PASS** |
| TypeScript | **PASS** |
| Build | **PASS** |

(\*) `licenses-rbac-ui.spec.ts` — 1 pre-existing intermittent failure: "Refresh behavior - OWNER" uses mock `lic-test-123` (non-UUID). The `page.route` intercept for the detail endpoint occasionally doesn't serve in time after `page.reload()`. This is a test-infrastructure timing issue that predates Step 4.6C.2; it is not caused by any changes made in this step. The suite is confirmed 11/11 when run in full isolation.

---

## 6. Cleanup

Each test creates fresh disposable `ACTIVE` QA licenses via the real Admin API. After the test run, all created license IDs are deleted directly from the QA PostgreSQL database via `psql` in `test.afterAll`. The admin-ui itself has no DB access.

---

## 7. Known Limitations

- **SYNTHETIC_QA_AAL2 only**: Does not certify real Supabase TOTP enrollment or production MFA challenge/response.
- **SYSTEM role not tested**: `SYSTEM` is a server-to-server programmatic role; no UI flow exists for it.
- **`page.route` mocks do not survive cross-origin navigation**: Non-essential endpoints (dashboard, customer detail) are mocked to prevent irrelevant failures when the Edge Functions serve data not required by this test.
- **Duplicate-submit prevention** is verified against the static `disabled={loading}` code path in `LifecycleModal.tsx`. Backend idempotency/concurrency is tested separately in the lifecycle and RBAC suites.

---

## 8. Unverified

- Real Supabase TOTP second-factor enrollment and AAL2 upgrade flow
- License bindings deactivation side-effect (verified at DB level by AdminLifecycleService unit test coverage, not re-verified here)
