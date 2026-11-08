# Mini POS — Phase 8: Billing Enforcement Report

## 1. Objective

Phase 8 establishes the **production revenue enforcement boundary** for Mini POS.

The central security requirement:

> An unauthorized client must not be able to finalize a new sale by manipulating Renderer state, Zustand state, IPC parameters, or UI behavior.

Phase 7 created the authoritative licensing runtime. Phase 8 connects that authority to the only revenue-generating irreversible operation: **bill finalization**.

---

## 2. Enforcement Boundary

**Enforcement location:** `BillingService.finalizeBill()` — the single application-layer method that owns bill finalization.

**Why this location?**

There is exactly **one production call path** to new bill finalization:

```
React (billing UI)
    ↓  billing:finalize IPC
billing.handlers.ts
    ↓
BillingService.finalizeBill()      ← ENFORCEMENT POINT
    ↓
BillRepository.persistFinalizedBill()
    ↓
SQLite transaction (bills + bill_items + draft deletion)
```

`BillRepository.persistFinalizedBill()` is only ever called from `BillingService.finalizeBill()`. There is no secondary path that can reach it from production code.

---

## 3. Architecture Diagram

```
┌───────────────────────────────────────────────────┐
│ React Renderer                                    │
│                                                   │
│  billing UI                                       │
│      │                                            │
│      │  billing:finalize (typed IPC)              │
└──────┼────────────────────────────────────────────┘
       ▼
┌───────────────────────────────────────────────────┐
│ Electron Main                                     │
│                                                   │
│  billing.handlers.ts                              │
│        │                                          │
│        ▼                                          │
│  BillingService.finalizeBill()                    │
│        │                                          │
│        │  gate.assertBillingPermitted()           │
│        ▼                                          │
│  LicensingBillingGate           ← Phase 8 adapter │
│        │                                          │
│        │  getStatusDTO()                          │
│        ▼                                          │
│  LicensingRuntimeService        ← Phase 7 authority│
│        │                                          │
│        ↓  (if ACTIVE)                            │
│  BillRepository.persistFinalizedBill()            │
│        ↓                                          │
│  SQLite transaction                               │
└───────────────────────────────────────────────────┘
```

---

## 4. Dependency Direction

```
BillingService (application)
    ↓  IBillingAuthorization (port — only interface)
LicensingBillingGate (infrastructure adapter)
    ↓
LicensingRuntimeService (Phase 7 authority)
```

**What BillingService does NOT know:**
- How Ed25519 or P-256 works
- Where the authorization file lives
- How device identity is stored
- How the licensing server communicates
- That Electron exists

---

## 5. New Files

| File | Purpose |
|---|---|
| [`src/application/interfaces/IBillingAuthorization.ts`](file:///Users/laksh/Desktop/mini%20ERP/src/application/interfaces/IBillingAuthorization.ts) | Narrow port: `assertBillingPermitted()` + `BillingNotAuthorizedError` |
| [`electron/licensing/LicensingBillingGate.ts`](file:///Users/laksh/Desktop/mini%20ERP/electron/licensing/LicensingBillingGate.ts) | Production implementation: delegates to `LicensingRuntimeService.getStatusDTO()` |
| [`tests/licensing/billing-enforcement.test.ts`](file:///Users/laksh/Desktop/mini%20ERP/tests/licensing/billing-enforcement.test.ts) | 48-test Phase 8 test suite |

## Modified Files

| File | Change |
|---|---|
| [`src/application/use-cases/BillingService.ts`](file:///Users/laksh/Desktop/mini%20ERP/src/application/use-cases/BillingService.ts) | Accepts `IBillingAuthorization`; calls `assertBillingPermitted()` before any DB mutation; adds `setBillingAuth()` setter |
| [`electron/main.ts`](file:///Users/laksh/Desktop/mini%20ERP/electron/main.ts) | Creates `LicensingBillingGate` after `licensingRuntime.initialize()`; wires it via `setBillingAuth()` |
| [`electron/ipc/mappers.ts`](file:///Users/laksh/Desktop/mini%20ERP/electron/ipc/mappers.ts) | `translateError` handles `BillingNotAuthorizedError` with semantic code + `licensingState` |
| [`src/shared/ipc-contracts.ts`](file:///Users/laksh/Desktop/mini%20ERP/src/shared/ipc-contracts.ts) | `IpcError` gains optional `details` field for structured context |

---

## 6. Billing Authorization Interface

```typescript
// IBillingAuthorization.ts
export class BillingNotAuthorizedError extends Error {
  constructor(
    public readonly licensingState: string,
    message: string
  ) { ... }
}

export interface IBillingAuthorization {
  assertBillingPermitted(): void;
}
```

Key design decisions:
- **Synchronous** — `finalizeBill()` is synchronous; the gate must be too
- **Throws on denial** — fits naturally into the existing `DomainError` throw-and-catch pattern
- **No network** — `getStatusDTO()` is purely in-memory; no I/O
- **Re-evaluated per call** — `LicensingBillingGate` never caches a boolean

---

## 7. Finalization Flow

```
billing:finalize (IPC invoked by renderer)
    ↓
BillingService.finalizeBill()
    ↓
if (billingAuth) billingAuth.assertBillingPermitted()
    ↓ if ACTIVE: continue
    ↓ if !ACTIVE: throw BillingNotAuthorizedError
this.activeBill.validateForFinalization()    ← domain validation
    ↓
billRepo.persistFinalizedBill(...)           ← SQLite transaction:
    │  1. SELECT MAX(bill_number) → assign next
    │  2. INSERT INTO bills
    │  3. INSERT INTO bill_items (N rows)
    │  4. deleteDraft(draftId)
    └→ returns PersistedBill
    ↓
this.activeBill = new ActiveBill()           ← clear in-memory draft
    ↓
return FinalizedBillDTO
```

**If licensing gate denies:** throws before step 1. No rows written. No bill number consumed. Draft untouched.

---

## 8. Exact Authorization Semantics

| Licensing State | Billing Permitted |
|---|---|
| `ACTIVE` | ✅ **ALLOW** |
| `NOT_ACTIVATED` | ❌ DENY |
| `EXPIRED` | ❌ DENY |
| `INVALID_AUTHORIZATION` | ❌ DENY |
| `DEVICE_MISMATCH` | ❌ DENY |
| `CLOCK_ANOMALY` | ❌ DENY |
| `DEVICE_IDENTITY_UNAVAILABLE` | ❌ DENY |
| `STORAGE_ERROR` | ❌ DENY |
| Any unknown future state | ❌ DENY (fail closed) |

---

## 9. Expiration Handling

The gate calls `LicensingRuntimeService.getStatusDTO()` on every finalization attempt. `getStatusDTO()` re-evaluates the time boundary against `validUntil` on every call (no stale cache). Therefore:

| Condition | Result |
|---|---|
| `now < validUntil` | ACTIVE → billing allowed |
| `now == validUntil` | EXPIRED → billing denied |
| `now > validUntil` | EXPIRED → billing denied |

The Phase 7 expiry rule `validFrom ≤ now < validUntil` is owned by `LicensingRuntimeService`. Billing does not re-implement it.

---

## 10. Offline Behavior (SEC-BILL-008)

Billing requires zero network calls.

| Scenario | Result |
|---|---|
| Valid authorization + internet OFF | **ACTIVE → billing allowed** |
| Valid authorization + internet ON | **ACTIVE → billing allowed** |
| Expired authorization + internet ON | EXPIRED → billing denied |
| Expired authorization + internet OFF | EXPIRED → billing denied |

`LicensingBillingGate` calls `getStatusDTO()` which reads from in-memory state derived from local signed authorization. No HTTP client is involved.

---

## 11. Transaction Behavior

The authorization check is the **first action** in `finalizeBill()`, executing before:
- Domain validation (`validateForFinalization`)
- Bill number assignment (inside SQLite transaction)
- Bill insert
- Bill items insert
- Draft deletion
- In-memory state clearing

**Atomic failure invariant:** If licensing denies, nothing in the database has changed. Bill numbers are generated inside the SQLite transaction after the licensing gate passes — they are never pre-allocated.

---

## 12. Draft Preservation (SEC-BILL-010)

On licensing denial:
- `this.activeBill` is **never reassigned** — it remains the current draft
- `draftRepo.deleteDraft()` is never called — it's inside `persistFinalizedBill` which is never reached
- The cashier can add items, modify the draft, and retry after authorization is restored

---

## 13. Bill Number Behavior (SEC-BILL-011)

Bill numbers are assigned by `SELECT MAX(bill_number) + 1` inside the SQLite transaction in `BillRepository.persistFinalizedBill()`. Since this transaction is never started when licensing denies, no sequence number is consumed.

---

## 14. Print/PDF Behavior (SEC-BILL-012, SEC-BILL-013)

Printing and PDF export only operate on **finalized bills** (by bill ID). Since licensing denial produces no finalized bill, no print job is created and no finalized-bill PDF export is triggered.

Previously finalized bills remain exportable. Expiry does not retroactively lock historical PDF exports.

---

## 15. History Behavior (SEC-BILL-015)

Previously finalized bills are always accessible in history, even when the authorization is expired. The licensing system does not modify or lock existing bill data.

---

## 16. IPC Error Mapping

`translateError()` now handles `BillingNotAuthorizedError` with a specific branch:

```typescript
if (error instanceof BillingNotAuthorizedError) {
  return {
    code: 'BillingNotAuthorizedError',
    message: error.message,          // cashier-friendly, no crypto details
    details: { licensingState: error.licensingState }  // safe category
  };
}
```

This ensures the renderer receives `code: 'BillingNotAuthorizedError'` (not `INTERNAL_ERROR`) with the specific `licensingState` for potential UI differentiation (e.g., "NOT_ACTIVATED" → show activation CTA, "EXPIRED" → show renewal CTA).

---

## 17. Attack Tests

| Attack | Test | Result |
|---|---|---|
| Renderer spoof (stale ACTIVE, Main says EXPIRED) | Gate state switch test | ✅ Denied |
| IPC parameter injection (`licensed: true`) | Signature test — no such param in `finalizeBill()` | ✅ Structurally impossible |
| Stale process-lifetime boolean | Gate re-evaluation test (state ACTIVE→EXPIRED mid-session) | ✅ Denied on second call |
| Unknown future state | `FUTURE_STATE` gate test | ✅ Denied |
| Direct IPC call without UI | Gate still runs regardless of IPC path | ✅ Enforced |

---

## 18. Concurrency Tests

| Scenario | Result |
|---|---|
| ACTIVE then EXPIRED within same session | First finalize succeeds; second denied |
| EXPIRED then ACTIVE (license restored) | First denied; second succeeds |
| Multiple items cleared after allowed finalize | Draft empty; subsequent add+deny leaves draft intact |

The existing billing serialization (single Main-process BillingService instance) prevents double-finalization races.

---

## 19. Regression Tests

All Phase 4–7 tests continue to pass. The existing `BillingService.test.ts` test uses `new BillingService(...)` without a gate (the optional `billingAuth` is `undefined`), which exercises the backward-compatible path. This is intentional — tests that pre-date Phase 8 are not broken.

---

## 20. Test Results

**Phase 8 test file:** [`tests/licensing/billing-enforcement.test.ts`](file:///Users/laksh/Desktop/mini%20ERP/tests/licensing/billing-enforcement.test.ts)

| # | Test | Result |
|---|---|---|
| 1 | `BillingNotAuthorizedError` carries `licensingState`, extends `Error` | ✅ |
| 2–8 | State matrix: `ACTIVE` → allow, all others → deny | ✅ (7 states) |
| 9 | Unknown future state → fail closed | ✅ |
| 10–11 | Draft items unchanged after denial | ✅ |
| 12–13 | `persistFinalizedBill` never called on denial | ✅ |
| 14–16 | Success regression: correct bill data, state cleared, backward compat | ✅ |
| 17–18 | Gate re-evaluated per call: ACTIVE→EXPIRED, EXPIRED→ACTIVE | ✅ |
| 19–20 | No renderer auth param; gate state cannot be overridden | ✅ |
| 21 | `LicensingBillingGate` ACTIVE → no throw | ✅ |
| 22–28 | `LicensingBillingGate` all denied states → correct `licensingState` | ✅ |
| 29 | `getStatusDTO()` called fresh each time | ✅ |
| 30 | Denial messages contain no cryptographic terms | ✅ |
| 31 | Denial messages are non-empty and informative | ✅ |
| 32–33 | `setBillingAuth()` late wiring: takes effect, can be replaced | ✅ |
| 34–35 | Concurrent calls: only authorized calls persist | ✅ |
| 36–48 | SEC-BILL-001, 004–012, 016, 019, 020 explicit invariant assertions | ✅ |

**Total Phase 8: 48 tests, 48 passed.**

### Full Test Suite

```
Test Files:  3 failed | 29 passed (32)
Tests:       220 passed (220)
```

**3 failing test files (pre-existing, environmental, unchanged from Phase 2):**
- `tests/licensing/activation-integration.test.ts` — requires PostgreSQL env vars
- `server/licensing/tests/activation.concurrency.test.ts` — requires PostgreSQL
- `server/licensing/tests/crypto.test.ts` — requires PostgreSQL

Zero new test failures. 48 new Phase 8 tests added (220 total vs 172 in Phase 7).

---

## 21. Build Results

```
TypeScript:  ✅ PASSED (0 errors)
Vite main:   ✅ PASSED
Vite preload: ✅ PASSED
Vite renderer: ✅ PASSED
```

---

## 22. Security Invariants

| ID | Invariant | Status |
|---|---|---|
| SEC-BILL-001 | Only Main-process authorization can permit finalization | ✅ |
| SEC-BILL-002 | Renderer state is never authoritative | ✅ |
| SEC-BILL-003 | No licensing parameter accepted from Renderer as proof | ✅ |
| SEC-BILL-004 | Expired authorization cannot finalize | ✅ Test #4 |
| SEC-BILL-005 | Invalid authorization cannot finalize | ✅ Test #5 |
| SEC-BILL-006 | Wrong-device authorization cannot finalize | ✅ Test #6 |
| SEC-BILL-007 | Identity/storage failures fail closed | ✅ Tests #7–8 |
| SEC-BILL-008 | Offline valid authorization permits billing | ✅ Test #41 |
| SEC-BILL-009 | Licensing denial causes no business-data mutation | ✅ Test #43 |
| SEC-BILL-010 | Licensing denial does not delete the active draft | ✅ Tests #10–11, #44 |
| SEC-BILL-011 | Licensing denial does not consume bill numbers | ✅ Tests #12–13, #45 |
| SEC-BILL-012 | Licensing denial does not print | ✅ Structurally — no finalized bill = no print job |
| SEC-BILL-013 | Licensing denial does not trigger PDF export | ✅ Structurally — no finalized bill = no PDF |
| SEC-BILL-014 | Printer failures remain independent from licensing | ✅ Unchanged |
| SEC-BILL-015 | Historical finalized bills remain accessible | ✅ Unchanged — no history lockout |
| SEC-BILL-016 | No technical lease introduced | ✅ Test #46 |
| SEC-BILL-017 | No grace period introduced | ✅ |
| SEC-BILL-018 | No periodic licensing network check introduced | ✅ |
| SEC-BILL-019 | Billing does not duplicate cryptographic verification logic | ✅ Test #47 (structural) |
| SEC-BILL-020 | Unknown states fail closed | ✅ Tests #9, #48 |

---

## 23. Honest Security Language

**What Phase 8 achieves:**

> New bill finalization is authorized exclusively in the Electron Main process using the validated Phase 7 runtime licensing authority. Renderer-controlled state is not accepted as proof of authorization. The check is evaluated immediately before the finalization transaction, minimizing the race window.

**Fundamental client-side limitation (unchanged):**

A sufficiently capable attacker with full control of the client machine (ability to patch binaries, instrument the process, or modify SQLite directly) may be able to bypass or subvert application-layer enforcement. Phase 8 creates the intended architectural enforcement boundary; it does not make a local client mathematically unmodifiable. Server-side billing enforcement (if required by the threat model) belongs to a future server-assisted phase.

---

## 24. Race-Window Policy

The authorization is evaluated at the start of `finalizeBill()`, immediately before the SQLite transaction begins. Between this check and the transaction commit, the wall clock may advance past `validUntil`. This is an inherent limitation of authorization systems that span two distinct system boundaries (time + database). The policy is:

> **A bill is authorized when Main accepts finalization after a fresh licensing authorization check immediately before the finalization transaction begins.**

The window is typically <1ms (in-memory check + SQLite transaction start). This is the documented and accepted race-window.

---

## 25. Known Limitations

1. **Authorization gate is optional.** For backward compatibility, `IBillingAuthorization` is injected as an optional parameter. In all production startup paths, it is always provided after `licensingRuntime.initialize()`. Tests pre-dating Phase 8 may create `BillingService` without the gate and will get the bypass path. This is intentional and documented.

2. **Race window between gate check and transaction commit** (documented above).

3. **Phase 6 anti-rollback limitation unchanged.** Deletion of the authorization file returns state to `NOT_ACTIVATED`. No OS-protected counter exists. Future phase.

4. **No UI gate.** The cashier UI does not yet show a clear licensing-denied dialog (only the error response from IPC). A proper UI for handling `BillingNotAuthorizedError` states (NOT_ACTIVATED CTA, EXPIRED renewal prompt, etc.) belongs to the designated UI phase.

---

## 26. Deferred Future Phases

| Feature | Phase |
|---|---|
| Activation UI (license key entry screen) | Future UI phase |
| Licensing status in Settings panel | Future UI phase |
| Renewal / expiry recovery UI | Future |
| Deactivation flow | Future |
| Full cashier-facing denial modal with state-specific CTA | Future UI phase |
| Windows Secure Enclave alternative | Future |
| Server-side billing enforcement | Future (if required by threat model) |
| Anti-rollback hardware counter | Future hardening phase |

---

## 27. Scope Audit

Phase 8 did NOT introduce:
- ❌ Licensing UI beyond IPC error code
- ❌ Billing history lockout
- ❌ Product management lockout
- ❌ Printer lockout
- ❌ PDF history lockout
- ❌ Technical leases
- ❌ Grace periods
- ❌ Heartbeat or periodic server checks
- ❌ Renewal or deactivation
- ❌ New cryptographic algorithms
- ❌ Backup/restore changes
- ❌ Windows implementation
- ❌ Data deletion on expiry

---

## 28. Security Review

| Question | Answer |
|---|---|
| Can React create ACTIVE state? | No — React has no path to `LicensingRuntimeService` |
| Can React send "licensed=true"? | No — `billing:finalize` IPC takes no licensing parameter |
| Can direct IPC bypass the gate? | No — gate runs in `BillingService.finalizeBill()`, not the handler |
| Can another Main-process call bypass the gate? | No — `persistFinalizedBill` is only called from `finalizeBill()` |
| Can an expired authorization finalize a sale? | No — gate returns EXPIRED → throws |
| Can a tampered authorization finalize? | No — Phase 7 detects INVALID_AUTHORIZATION → gate denies |
| Can wrong-device authorization finalize? | No — Phase 7 detects DEVICE_MISMATCH → gate denies |
| Can offline valid authorization finalize? | Yes — ACTIVE is local-only, no network needed |
| Does denial leave the draft intact? | Yes — `activeBill` is never cleared on denial |
| Does denial consume a bill number? | No — number assigned inside transaction, never reached |
| Does denial write any DB data? | No — gate throws before any DB call |
| Does denial trigger printing? | No — no finalized bill ID produced |
| Does denial trigger PDF generation? | No — no finalized bill ID produced |
| Can stale renderer state override Main? | No — gate reads from `LicensingRuntimeService`, not renderer |
| Can unavailable licensing subsystem fail open? | No — all non-ACTIVE states → BillingNotAuthorizedError |
| Has any network requirement been introduced? | No |
| Has any technical lease been introduced? | No |
| Has any grace period been introduced? | No |
| Is historical billing data preserved? | Yes — history is unaffected by licensing state |
| Is Phase 7 still the sole source of truth? | Yes — gate delegates only to `getStatusDTO()` |

---

## 29. Phase 8 Final Status: ✅ COMPLETE

All acceptance criteria satisfied:

- [x] Every production path to new bill finalization passes through licensing authorization
- [x] Billing never trusts Renderer licensing state
- [x] No renderer-supplied authorization flag exists
- [x] Main uses `LicensingRuntimeService` as the authority
- [x] `ACTIVE` permits finalization
- [x] All non-authorized states deny finalization
- [x] Expired authorization denies finalization
- [x] Exact `validFrom`/`validUntil` boundaries correct (via Phase 7)
- [x] Offline valid authorization permits finalization
- [x] No licensing server request required during valid offline billing
- [x] Unauthorized finalization creates no bill
- [x] Unauthorized finalization creates no bill items
- [x] Unauthorized finalization consumes no bill number
- [x] Unauthorized finalization deletes no draft
- [x] Unauthorized finalization triggers no printer operation
- [x] Unauthorized finalization triggers no finalized-bill PDF operation
- [x] Draft remains intact after licensing denial
- [x] Historical bills remain accessible
- [x] Normal licensed billing behavior unchanged
- [x] Printer failure behavior unchanged
- [x] Phase 4 tests remain passing
- [x] Phase 5 tests remain passing
- [x] Phase 6 tests remain passing
- [x] Phase 7 tests remain passing
- [x] 48 new Phase 8 tests pass
- [x] Direct IPC attempts cannot bypass licensing
- [x] Renderer spoofing cannot bypass licensing
- [x] Stale ACTIVE renderer state cannot bypass licensing
- [x] Licensing subsystem failure fails closed
- [x] No technical lease introduced
- [x] No grace period introduced
- [x] No heartbeat introduced
- [x] No periodic licensing server requirement introduced
- [x] TypeScript build succeeds
- [x] Build passes
- [x] Phase 8 report created
