# Mini POS — Phase 10: Lifecycle Threat Model

> **PHASE TYPE: DESIGN / SPECIFICATION ONLY**
> This document is the formal threat model companion to `phase-10-lifecycle-security-specification.md`.

---

## 1. Purpose

This document provides the formal threat model for lifecycle operations (deactivation, transfer, recovery, admin reset, revocation) in the Mini POS licensing system. It extends the Phase 1 threat model (`docs/licensing-threat-model-v1.md`) with lifecycle-specific threats, trust boundaries, attack surfaces, and residual risks.

---

## 2. Security Objectives (Lifecycle-Specific)

| ID | Objective |
|---|---|
| SO-L01 | Only the currently bound device or an explicitly authorized admin recovery mechanism may release a device binding. |
| SO-L02 | The activation code provides no deactivation, transfer, or recovery capability after initial activation. |
| SO-L03 | Lifecycle challenges are single-use and operation-specific; no cross-operation replay is possible. |
| SO-L04 | Every lifecycle operation is idempotent; response loss cannot create unrecoverable states. |
| SO-L05 | Lost-device recovery cannot be reduced to possession of the local authorization file or activation code. |
| SO-L06 | Admin operations are explicitly authenticated, authorized, and audited. No implicit admin access exists. |
| SO-L07 | Server-side revocation does not introduce network dependencies for legitimate offline billing. |
| SO-L08 | The renderer process cannot initiate or influence lifecycle operations without Main process mediation. |
| SO-L09 | Transfer cannot race to an inconsistent database state. |
| SO-L10 | Admin credentials are never stored in plaintext, logged, or transmitted in the clear. |

---

## 3. Threat Actors (Lifecycle-Specific)

| ID | Actor | Capability Level | Primary Lifecycle Threat |
|---|---|---|---|
| T1 | Legitimate Customer Changing Devices | Low | Wants smooth transfer; may retry on failure |
| T2 | Customer With Both Devices | Low-Medium | Tries to avoid deactivating old device before getting new one |
| T3 | Customer With Lost Device | Low | Cannot provide device proof; needs out-of-band recovery |
| T4 | Attacker With Stolen Device | Medium | Has device key if OS is not encrypted; may attempt deactivation on behalf of owner |
| T5 | Attacker With Activation Code | Low | Code obtained via email/receipt; attempts to use as recovery credential |
| T6 | Attacker With Copied Auth File | Low | Has auth.json; attempts to use as ownership proof |
| T7 | Attacker With Cloned App Data | Low-Medium | Cloned entire userData directory; attempts to operate on multiple machines |
| T8 | Malicious Renderer | Medium | JavaScript context; may invoke lifecycle IPC channels |
| T9 | Malicious Local Process | Medium | Has user-level OS access; may try to trigger lifecycle via IPC |
| T10 | Replay Attacker | Medium | Captured deactivation request/response; attempts to resubmit |
| T11 | Recovery Replay Attacker | Medium | Obtained a recovery operation record; attempts repeated use |
| T12 | Racing Attacker | High | Controls two HTTP clients; attempts concurrent lifecycle operations |
| T13 | Attacker With Server API Access | High | Has unauthenticated API access; cannot authenticate as admin |
| T14 | Compromised Administrator | High | Valid admin credentials; acting maliciously |
| T15 | Sophisticated Binary Patcher | Very High | Has debugger access; can patch Electron binary |

---

## 4. Lifecycle Trust Boundary Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ZONE A: React Renderer (UNTRUSTED)                                      │
│   Can initiate lifecycle IPC call                                       │
│   Cannot: fabricate P-256 signature, access server directly             │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │ lifecycle:deactivate IPC
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ZONE B: Electron Preload (UNTRUSTED relay)                              │
│   Typed relay only                                                      │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │ invoke lifecycle handler
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ZONE C/D: Electron Main + Licensing Module (HIGH TRUST)                 │
│   Orchestrates lifecycle: requests challenge, calls native signer,      │
│   submits to server, manages local state                                │
└──────────┬──────────────────────────────────────────────────────────────┘
           │              │
           │ sign(bytes)  │ POST /lifecycle/deactivation
           ▼              ▼
┌──────────────┐   ┌──────────────────────────────────────────────────────┐
│ ZONE E/F:    │   │ ZONE I/J: Licensing Server + Database (ABSOLUTE)     │
│ Secure       │   │   Verifies P-256 proof                               │
│ Enclave /    │   │   Enforces binding invariants                        │
│ OS Keychain  │   │   Records audit events                               │
│ (HIGHEST     │   │   Manages lifecycle_requests idempotency             │
│  LOCAL)      │   └──────────────────────────────────────────────────────┘
└──────────────┘
```

**Lifecycle Authority Chain:**
```
Native Identity (private key)
      ↓ signs challenge
Server (verifies P-256 proof, enforces binding constraints)
      ↓ commits
Database (authoritative binding state)
```

Neither the Renderer, nor the local `authorization.json`, nor the activation code can influence this chain.

---

## 5. Threat Catalog

### 5.1 Deactivation Threats

| ID | Threat | Actor | Asset | Attack Vector | Trust Boundary | Required Auth | Replay Protection | Expected Result | Residual Risk |
|---|---|---|---|---|---|---|---|---|---|
| LT-01 | Deactivate without device key | T5/T6 | License slot | Submit deactivation without valid P-256 proof | Server API | P-256 challenge-response | Challenge single-use | REJECTED: DEVICE_PROOF_INVALID | None |
| LT-02 | Device B signs deactivation for Device A | T2/T12 | Device A's binding | Submit challenge signed by Device B's key | Server API | P-256 of Device A specifically | Challenge bound to A's deviceKeyId | REJECTED: DEVICE_PROOF_INVALID | None |
| LT-03 | Replay old deactivation request | T10 | License slot (double-free) | Re-submit captured deactivation HTTP request | Network/server | Idempotency check | lifecycle_requests cache | IDEMPOTENT: cached SUCCESS | None |
| LT-04 | Replay consumed deactivation challenge | T10 | License slot | Re-submit consumed challenge | Server DB | Challenge CONSUMED status | Atomic UPDATE WHERE PENDING | REJECTED: CHALLENGE_REPLAYED | None |
| LT-05 | Use activation proof as deactivation proof | T10 | License slot | Submit ACTIVATION signature for DEACTIVATION operation | Server crypto | Domain separation | Different tag prefix | REJECTED: wrong domain | None |
| LT-06 | Race deactivation + activation to double-bind | T12 | License slot (exceed max) | Concurrent HTTP requests | Server DB | FOR UPDATE locks | Serial transaction evaluation | Deterministic: one wins | None |
| LT-07 | Offline deactivation to "free" slot locally | T2 | License slot | Delete local auth.json without server call | Local file system | N/A | Server not notified | Server binding remains ACTIVE | Slot not freed (hurts user) |
| LT-08 | Renderer invokes lifecycle:deactivate arbitrarily | T8 | License state | Direct IPC call from malicious JS | IPC boundary | Main process mediates | N/A | Main requires device key; renderer cannot fabricate | None |

### 5.2 Transfer Threats

| ID | Threat | Actor | Asset | Attack Vector | Trust Boundary | Expected Result | Residual Risk |
|---|---|---|---|---|---|---|---|
| LT-09 | Transfer without deactivating old device | T2 | Max-device limit | Attempt activation on Device B while A is still bound | Server DB | DEVICE_LIMIT_REACHED until A deactivates | None |
| LT-10 | Race: B activates before A finishes deactivating | T12 | License slot consistency | Concurrent HTTP timing | Server DB | B rejected (limit), A deactivates, B retries → Correct | None |
| LT-11 | Response-loss after deactivation: A retries, B already activated | T1 (not attacker) | No data loss | Network timeout | Idempotency | A retry returns cached DEACTIVATED; B is correctly ACTIVE | None |

### 5.3 Recovery Threats

| ID | Threat | Actor | Asset | Attack Vector | Trust Boundary | Expected Result | Residual Risk |
|---|---|---|---|---|---|---|---|
| LT-12 | Attacker uses activation code for recovery | T5 | License slot | Contacts support with only the activation code | Support process | REJECTED: activation code is not ownership proof | Social engineering if support accepts code |
| LT-13 | Attacker uses copied auth.json for recovery | T6 | License slot | Contacts support claiming the auth file proves ownership | Support process | REJECTED: auth file is not ownership proof | Social engineering if support accepts file |
| LT-14 | Attacker impersonates device owner to support | T5/T4 | License slot | Social engineering support agent | Human | REJECTED by proper verification | Depends on support procedure quality |
| LT-15 | Replay recovery request | T11 | License slot (double-recover) | Re-submit recovery admin action | Admin idempotency | Admin action cached by adminRequestId | None |
| LT-16 | Generate new device key and self-activate on revoked slot | T4 | License slot | Attempt activation after admin revocation | Server | LICENSE_REVOKED returned | None |

### 5.4 Admin Operation Threats

| ID | Threat | Actor | Asset | Attack Vector | Trust Boundary | Expected Result | Residual Risk |
|---|---|---|---|---|---|---|---|
| LT-17 | Unauthorized admin API call | T13 | License state | POST to admin endpoint without credentials | Admin auth middleware | 401/403 UNAUTHORIZED | None |
| LT-18 | Admin credential brute force | T13 | Admin access | Rapid repeated auth attempts | Rate limiter + lockout | Lockout after 5 failures | Distributed attack from many IPs |
| LT-19 | Timing attack on admin auth comparison | T13 | Admin credential | Measure response time differences | Constant-time comparison | Response time uniform regardless of match | None |
| LT-20 | Compromised admin performs unauthorized reset | T14 | License state | Legitimate credentials, malicious action | Audit trail | Action succeeds; audit records admin ID + reason | Forensic traceability after the fact |
| LT-21 | Admin action without audit event | T14 | Auditability | Directly modify DB bypassing API | Transaction atomicity | Admin API + audit event committed atomically | Direct DB access bypasses application |
| LT-22 | Admin revokes license, device stays offline | — | Revocation effectiveness | Offline device | N/A | Device continues ACTIVE until validUntil | Accepted offline-first tradeoff |

### 5.5 Offline / Revocation Threats

| ID | Threat | Actor | Asset | Attack Vector | Trust Boundary | Expected Result | Residual Risk |
|---|---|---|---|---|---|---|---|
| LT-23 | Restore old valid auth.json after server deactivation | T6 | License state | Copy backup auth.json back to device | Local file system | Locally ACTIVE; server DEACTIVATED | Auth expires eventually; any online action surfaces server state |
| LT-24 | Revoked license in offline use | — | Revenue loss | Normal operation after server revocation | N/A | Device continues ACTIVE offline | Offline revocation delay (accepted) |
| LT-25 | Clock rollback to extend offline validity | T7 | License expiry | OS clock manipulation | Existing clock detection | CLOCK_ANOMALY state (existing) | Minor window if app never ran |

---

## 6. Lifecycle-Specific Security Properties

### 6.1 Challenge Cryptographic Properties

The lifecycle challenge has the following cryptographic guarantees:

| Property | Mechanism |
|---|---|
| Unpredictability | 32-byte CSPRNG nonce |
| Single-use | Atomic `UPDATE WHERE status = 'PENDING'` |
| Freshness | 60-second TTL, server-enforced |
| Operation binding | `purpose` field in challenge + domain separation tag |
| Device binding | `deviceKeyId` field in challenge + verified against `devices` table |
| License binding | `licenseId` field (deactivation only) |
| Tamper detection | Full challenge object is canonicalized before signing |

### 6.2 Why Activation Code Cannot Serve as Recovery Credential

The activation code is a **symmetric commercial identifier**:
- High entropy for license key brute-force resistance.
- Already consumed at activation time.
- Stored on the client only during the HTTP request, then discarded.
- Not cryptographically bound to the device.

Using it as a recovery credential would create a second attack surface with entirely different properties: anyone who can read the customer's email (purchase receipt) could perform a "recovery" to steal the license slot. This is rejected.

### 6.3 Why the Authorization File Cannot Be a Recovery Credential

The `authorization.json` is:
- A **public artifact** — it is readable by any process with file access.
- Not a proof of private key possession.
- Deliberately designed to be copied and verified (for local startup) — it has no secrecy property.

Using it as a recovery credential would mean that anyone with a filesystem backup (including cloud sync) could initiate a recovery. This completely defeats the purpose of the cryptographic device-binding model.

### 6.4 Why Admin Recovery Uses Out-of-Band Verification

The admin recovery path requires the admin to:
1. Verify the customer's identity through purchase records (order ID + payment processor confirmation).
2. Verify the reported `licenseId` matches the purchase.
3. Verify no suspicious activity (multiple recovery requests in a short period).

This is the only path that provides meaningful authentication without the device's private key. It intentionally introduces friction to raise the cost of social engineering attacks.

---

## 7. Binding State Database Invariants

The following database invariants must hold at all times. Phase 11 implementation must verify these after every lifecycle operation:

| Invariant | Description |
|---|---|
| INV-L01 | For any license with `max_devices = 1`, at most one `license_bindings` row with `status = 'ACTIVE'` exists at any time. |
| INV-L02 | A `deviceKeyId` cannot have ACTIVE bindings on more than one distinct license simultaneously. |
| INV-L03 | Every ACTIVE binding references an existing, non-deleted row in `devices`. |
| INV-L04 | Every ACTIVE binding references a license with `status = 'ACTIVE'` (not REVOKED or EXPIRED). Exception: revocation may leave bindings ACTIVE temporarily (offline scenario). |
| INV-L05 | Every `lifecycle_requests` row with `status = 'SUCCESS'` has a non-null `completed_at`. |
| INV-L06 | Every successful lifecycle operation has a corresponding `audit_events` row. |
| INV-L07 | No `device_challenges` row is both `status = 'CONSUMED'` and referenced in a FAILED lifecycle request (challenges are consumed only on successful proof verification). |

---

## 8. Renderer Cannot Be Lifecycle Authority

The renderer is explicitly excluded from all lifecycle authority:

**What the renderer CAN do:**
- Invoke `window.api.licensing.deactivate()` (IPC call only).
- Display the deactivation confirmation dialog.
- Display the result (success or error).

**What the renderer CANNOT do:**
- Directly call the licensing server API.
- Access the device's private key or Secure Enclave.
- Produce a valid P-256 signature for a challenge.
- Modify the `authorization.json` file.
- Invoke admin operations.
- Override the server-side binding state.

The IPC boundary enforces this: the Main process controls the actual challenge signing, server communication, and local state management. The renderer's IPC invocation is merely a trigger.

---

## 9. Admin Authentication Threat Analysis

The current Phase 2–9 codebase has **no admin authentication implemented**. This is a known gap documented here for Phase 11.

### Current Vulnerabilities (to be fixed in Phase 11)

| Vulnerability | Current State | Phase 11 Fix |
|---|---|---|
| `LicenseService.revokeLicense()` has no auth | Any API caller can revoke | Add `adminAuth` middleware |
| No admin rate limiting | Unlimited requests | Rate limiter + lockout |
| No audit trail on admin calls | No admin ID logged | Add `admin_id` to `audit_events` |
| Admin credentials not defined | No admin exists | Define bcrypt-hashed env var credentials |

### Timing Attack Resistance

Admin credential comparison **must use** `crypto.timingSafeEqual()`:

```typescript
// CORRECT (constant-time)
const match = crypto.timingSafeEqual(
  Buffer.from(providedCredential, 'utf8'),
  Buffer.from(expectedCredential, 'utf8')
);

// INCORRECT (timing-vulnerable)
if (providedCredential === expectedCredential) { ... }
```

If the provided and expected credentials differ in length, `timingSafeEqual` throws. The implementation must normalize lengths first (or reject early with a generic error that does not reveal the expected length).

---

## 10. Offline Revocation: Formal Security Tradeoff

This tradeoff is formally acknowledged and documented.

### The Tradeoff

| Property | Value |
|---|---|
| Offline operation guarantee | Absolute — no network required after activation |
| Revocation notification | Not guaranteed — offline devices cannot receive it |
| Maximum revocation delay | Remaining license validity from revocation date |
| Mitigation | Issue licenses with finite validity terms |
| Alternative (rejected) | Periodic heartbeat — introduces network dependency |

### Why No Heartbeat Is Introduced

A heartbeat would:
1. Require internet connectivity for continued operation.
2. Violate the core product requirement: "Billing remains offline-first."
3. Introduce failure modes for legitimate users with unreliable internet.
4. Create timing windows where a temporarily offline device is blocked.

This tradeoff is explicitly accepted. Mini POS is designed for small retail businesses that may have unreliable internet. The licensing system must not penalize them.

---

## 11. Residual Risks Summary

| Risk | Impact | Likelihood | Mitigation | Accepted? |
|---|---|---|---|---|
| Social engineering during support recovery | HIGH (license transferred fraudulently) | LOW-MEDIUM | Strict purchase verification procedure | YES, V1 |
| Offline revocation delay | MEDIUM (license continues after revocation) | LOW | Finite license terms | YES |
| Admin credential compromise | HIGH (unlimited license manipulation) | LOW | MFA, audit, rotation | YES with controls |
| Binary patching of client | MEDIUM (bypass local enforcement) | LOW | Code signing, server-side enforcement | YES |
| Local auth restoration after deactivation | LOW (locally ACTIVE, server DEACTIVATED) | LOW | Authorization expiry; short post-deactivation TTL | YES |
| Device key loss without clear cause | LOW (legitimate user blocked) | LOW | Support recovery channel | YES |
| Distributed admin brute force | MEDIUM (admin access gained) | LOW | Per-IP lockout; MFA | YES with controls |

---

## 12. Protocol Test Vectors (Non-Production)

These test vectors document the expected behavior of the deactivation proof mechanism. They are not production tests of unimplemented endpoints.

### 12.1 Domain Separation Distinguishability

Given identical challenge payloads `C`:

```
Activation signature:   sign("MINIPOS-DEVICE-CHALLENGE-V1:" || canonicalize(C), privateKey)
Deactivation signature: sign("MINIPOS-DEACTIVATION-V1:"    || canonicalize(C), privateKey)
```

These produce distinct byte strings and therefore distinct signatures. Neither can substitute for the other in verification.

### 12.2 Challenge Single-Use Enforcement

```
Challenge created: status = 'PENDING'
First consumption attempt: UPDATE WHERE status='PENDING' → rowCount = 1 → ACCEPTED
Second consumption attempt: UPDATE WHERE status='PENDING' → rowCount = 0 → REJECTED: CHALLENGE_REPLAYED
```

This behavior is already implemented in `ChallengeService.consumeChallenge()` for activation. The same code path applies for deactivation challenges.

### 12.3 Idempotency Semantics

```
Request 1 (requestId: X, hash: H): PENDING → SUCCESS, cached(response)
Request 2 (requestId: X, hash: H): lifecycle_requests.status = SUCCESS → return cached(response)
Request 3 (requestId: X, hash: H'): lifecycle_requests.payload_hash = H ≠ H' → LIFECYCLE_REQUEST_CONFLICT
Request 4 (requestId: Y, same device, already deactivated): BINDING_NOT_FOUND
```

---

## 13. Consistency with Phase 1 Threat Model

This document extends `docs/licensing-threat-model-v1.md`. All existing security objectives (SO-01 through SO-10) remain valid and are not modified.

| Phase 1 Invariant | Phase 10 Impact |
|---|---|
| SEC-001: Only server-signed authorizations accepted | Unchanged |
| SEC-002: Changing signed data invalidates signature | Unchanged |
| SEC-003: Private device keys never cross IPC | Unchanged — lifecycle signing also via Secure Enclave |
| SEC-004: Device proves possession via asymmetric challenge-response | Extended to deactivation challenges |
| SEC-005: Server challenges are single-use | Extended to lifecycle challenges |
| SEC-006: Concurrent activations cannot exceed max_devices | Extended: concurrent deactivation/activation also serialized |
| SEC-007: Same idempotency request ID yields same result | Extended: `lifecycle_requests` table mirrors `activation_requests` |
| SEC-008: Billing remains fully operational offline | UNCHANGED — no heartbeat introduced |
| SEC-009: Expired authorization blocks new bills | Unchanged |
| SEC-010: Local expiry cannot be extended | Unchanged |
| SEC-011: Licensing failures never delete POS business data | Unchanged — deactivation only touches auth.json |
| SEC-012: Renderer state is never the authoritative licensing decision | Unchanged — renderer cannot authorize lifecycle either |

**Zero contradictions between Phase 1 and Phase 10 designs.**

---

## 14. Final Threat Model Summary

### Controls Introduced by Phase 10 Design

| Control | Threat Mitigated |
|---|---|
| P-256 challenge-response for deactivation | LT-01, LT-02, LT-05, LT-07 |
| Domain separation per lifecycle operation | LT-05 (cross-operation replay) |
| Single-use challenges with atomic DB consumption | LT-04, LT-10 |
| `lifecycle_requests` idempotency table | LT-03, LT-15 |
| `FOR UPDATE` locking on license + binding rows | LT-06, LT-09, LT-10 |
| Admin authentication with constant-time comparison | LT-17, LT-19 |
| Admin rate limiting + lockout | LT-18 |
| Audit event committed in same transaction as operation | LT-21 |
| Support-assisted admin recovery (not activation-code recovery) | LT-12, LT-13 |
| No local authorization file as recovery credential | LT-13, LT-23 |
| No heartbeat or periodic network check | Preserves offline-first guarantee |

### Accepted Residual Risks

| Risk | Reason Accepted |
|---|---|
| Social engineering in support recovery | V1 user base; V2 can add account portal |
| Offline revocation delay | Fundamental to offline-first architecture |
| Admin credential compromise | Standard operational risk; mitigated by audit trail |
| Binary patching | Standard desktop software risk; server-side enforcement provides floor |

---

*Document: `docs/phase-10-lifecycle-threat-model.md`*
*Phase: 10 (Design/Specification Only)*
*Status: COMPLETE*
*No production code was modified.*
