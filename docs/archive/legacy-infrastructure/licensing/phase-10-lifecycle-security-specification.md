# Mini POS — Phase 10: Lifecycle Security Specification

> **PHASE TYPE: DESIGN / SPECIFICATION ONLY**
> No lifecycle production code is implemented in this document.
> This specification is the input contract for Phase 11 implementation.

---

## 1. Purpose

This document specifies the cryptographic lifecycle operations for the Mini POS licensing subsystem beyond the initial activation, which was designed and implemented in Phases 0–9.

Operations in scope:
- **A. Voluntary Deactivation** — the currently bound device explicitly releases its license slot.
- **B. License Transfer** — a license moves from one device to another via deactivation + reactivation.
- **C. Lost/Stolen/Destroyed Device Recovery** — legitimate customer regains access when private key is inaccessible.
- **D. Administrative Reset/Revocation** — server-authoritative operations under explicit, audited authorization.
- **E. Re-activation** — activating a device after a previous deactivation.
- **F. Recovery after local authorization deletion** — authorization file is gone but device key is intact.
- **G. Recovery after device key loss** — device physically exists but the Secure Enclave key is lost.

---

## 2. Scope and Constraints

### 2.1 What This Phase DOES
- Defines all lifecycle protocol states, transitions, and invariants.
- Specifies exact request/response schemas for each lifecycle operation.
- Defines challenge formats, domain separation, and canonicalization for each operation.
- Designs replay protection, idempotency, and concurrency semantics.
- Specifies the recovery design for lost/destroyed devices.
- Defines admin operations and their authentication boundaries.
- Produces the Phase 11 implementation plan.

### 2.2 What This Phase DOES NOT DO
- Does **NOT** implement deactivation, transfer, or recovery in production code.
- Does **NOT** modify billing enforcement.
- Does **NOT** modify the activation protocol.
- Does **NOT** modify existing cryptographic algorithms.
- Does **NOT** introduce technical leases, heartbeats, or grace periods.
- Does **NOT** modify local authorization persistence.
- Does **NOT** modify current UI behavior.

### 2.3 Preserved Architecture
```
Native Device Identity (P-256 / Secure Enclave)
      ↓
P-256 ECDSA device proof
      ↓
Server activation
      ↓
Server authorization signing (Ed25519)
      ↓
Ed25519 signed authorization
      ↓
Local verification
      ↓
Main runtime authority
      ↓
Billing enforcement gate
```

---

## 3. Formal Terminology

### 3.1 Deactivation
> The currently bound device **voluntarily** gives up its active license binding through an online, server-mediated operation using the device's cryptographic private key.

- Requires the existing device private key to be present and functional.
- Is an **online operation** — the server must receive and commit the deactivation.
- Results in: server binding released, local authorization invalidated.
- The license slot becomes available for a new device.

### 3.2 Transfer
> The logical operation of **deactivating on Device A** and **activating on Device B**, resulting in the license being bound to Device B.

Transfer is NOT a single atomic server operation. It is:
1. Deactivation of Device A (confirmed by server)
2. Activation of Device B (normal activation protocol, Phase 5)

### 3.3 Recovery
> The process by which a **legitimate customer regains license access** when the previous device's private key is permanently unavailable, through a mechanism that does not depend on the device private key.

Recovery requires stronger out-of-band authentication than normal operations because the normal cryptographic proof of device ownership cannot be provided.

### 3.4 Revocation
> A **server-authoritative action** that transitions a license or binding to an invalid/unusable state, independently of the client's preference or presence.

- Deactivation is **device-initiated** using the device's private key.
- Revocation is **server-initiated**, typically an admin operation.
- An offline device cannot receive a revocation immediately (see Section 18).

### 3.5 Reset
> An **administrative operation** that modifies binding state under explicitly constrained, authenticated, and audited authorization.

Admin reset is the mechanism by which recovery from lost devices is ultimately performed.

---

## 4. Threat Actors

| ID | Actor | Description |
|---|---|---|
| T1 | Legitimate Customer Changing Devices | Honest user, wants to transfer license to a new PC. Has full access to old device. |
| T2 | Customer With Both Devices | Has old device (still working) and wants to use both. Attempts to bypass deactivation. |
| T3 | Customer With Lost Device | Honestly cannot access the old device's private key. Seeks legitimate recovery. |
| T4 | Attacker With Stolen Device | Has physical access to the device. May have access if not encrypted. |
| T5 | Attacker With Activation Code | Obtained the original activation code (e.g., email access, purchase receipt). |
| T6 | Attacker With Copied Auth File | Obtained the `authorization.json` (e.g., backup, file access). |
| T7 | Attacker With Copied App Data | Cloned the entire app data directory. |
| T8 | Malicious Renderer | Compromised React process attempting to manipulate lifecycle state. |
| T9 | Malicious Local Process | Local process with user-level access attempting to initiate lifecycle operations. |
| T10 | Replay Attacker | Captured old deactivation/recovery request and attempts to re-submit it. |
| T11 | Recovery Replay Attacker | Obtained a recovery token or request and attempts to use it more than once. |
| T12 | Racing Attacker | Controls two clients and attempts to race Device A deactivation against Device B activation. |
| T13 | Attacker With Server API Access | Has access to the licensing server API but not admin credentials. |
| T14 | Compromised Administrator | Valid admin credentials but acting maliciously. |
| T15 | Sophisticated Binary Patcher | Has debugger access, can patch Electron binary at runtime. |

---

## 5. Trust Boundaries

| Zone | Description | Trust for Lifecycle |
|---|---|---|
| A — Renderer | React UI | ZERO — may initiate, never authorize |
| B — Preload | IPC bridge | ZERO — typed relay only |
| C — Electron Main | Orchestration | HIGH — lifecycle client, signs challenges |
| D — Licensing Module | Crypto/state | HIGH — single lifecycle client authority |
| E — Native Identity | Secure Enclave | HIGHEST LOCAL — signs lifecycle proofs |
| F — OS Keychain | Key storage | HIGHEST LOCAL — private key at rest |
| G — Local auth file | Disk storage | UNTRUSTED — read-only reference, not proof |
| H — SQLite | Business data | OUT OF SCOPE for lifecycle |
| I — Licensing Server | Commercial authority | ABSOLUTE — final word on binding state |
| J — Server Database | Source of truth | ABSOLUTE |
| K — Admin Credential Store | Admin secrets | HIGH — must be strictly controlled |

**Critical Invariant:** `Native Identity (private key) → Server (verifies proof) → Database (binding state)`
Neither the Renderer nor the local authorization file can influence binding state.

---

## 6. Deactivation Protocol Design

### 6.1 Security Question: How Does the Server Know Device A is Deactivating?

The server verifies that the deactivation request was cryptographically signed by the private key corresponding to the `deviceKeyId` that is currently ACTIVE in `license_bindings`. The mechanism is identical in structure to the activation challenge-response, but:

- Challenge domain is `MINIPOS-DEACTIVATION-V1:` (operation-specific).
- The server verifies the signature against the **already-registered public key** in `devices` — no new public key is needed.
- The `license_bindings` row is updated atomically in the same transaction.

This is NOT achievable by: `licenseId` alone, `deviceKeyId` alone, the activation code, the local `authorization.json`, or any renderer-exposed state.

### 6.2 Protocol Sequence

```
Step 1: Client requests deactivation challenge
POST /api/v1/lifecycle/deactivation/challenge
Req: { deviceKeyId: string, licenseId: string }
Res: { challenge: DeviceLifecycleChallenge }

Step 2: Client signs challenge with device private key
[MINIPOS-DEACTIVATION-V1: || canonicalize(challenge)]
  ↓ P-256 ECDSA sign (Secure Enclave)
challengeSignature (base64url)

Step 3: Client submits deactivation request
POST /api/v1/lifecycle/deactivation
Req: {
  deactivationRequestId: string  // UUIDv4, client-generated
  licenseId: string
  deviceKeyId: string
  challenge: DeviceLifecycleChallenge
  challengeSignature: string     // base64url
}
Res (200): {
  status: "DEACTIVATED"
  deactivationId: string         // server-assigned UUID
  timestamp: string              // ISO8601
}

Step 4: Client invalidates local authorization
ONLY after receiving HTTP 200 with status: "DEACTIVATED":
  - Delete authorization.json
  - Transition runtime state to NOT_ACTIVATED
```

### 6.3 Deactivation Challenge Schema

```json
{
  "protocolVersion": 1,
  "challengeId": "uuid-v4",
  "issuedAt": "ISO8601",
  "expiresAt": "ISO8601",
  "nonce": "base64url-32-bytes",
  "deviceKeyId": "hex string",
  "licenseId": "uuid",
  "purpose": "DEACTIVATION"
}
```

- `purpose` is always `"DEACTIVATION"` — distinct from `"ACTIVATION"`.
- `licenseId` binds the challenge to the specific license being deactivated.
- Challenge TTL: **60 seconds**.

### 6.4 Server Deactivation Transaction (Pseudo-SQL)

```sql
BEGIN SERIALIZABLE

  -- 1. Idempotency check
  INSERT INTO lifecycle_requests (request_id, operation, payload_hash, status)
  VALUES ($deactivationRequestId, 'DEACTIVATION', $hash, 'PENDING')
  ON CONFLICT (request_id) DO NOTHING

  SELECT status, response_payload, payload_hash
  FROM lifecycle_requests WHERE request_id = $deactivationRequestId FOR UPDATE

  IF status != 'PENDING':
    IF payload_hash != $currentHash: REJECT LIFECYCLE_REQUEST_CONFLICT
    RETURN cached response

  -- 2. Verify license + active binding
  SELECT * FROM licenses WHERE id = $licenseId FOR UPDATE
  SELECT * FROM license_bindings
    WHERE license_id = $licenseId AND device_key_id = $deviceKeyId
    AND status = 'ACTIVE' FOR UPDATE
  IF no active binding: REJECT BINDING_NOT_FOUND

  -- 3. Load device public key
  SELECT public_key FROM devices WHERE device_key_id = $deviceKeyId

  -- 4. Verify + consume challenge (purpose='DEACTIVATION', licenseId match)
  ChallengeService.consumeChallenge(challenge, deviceKeyId, 'DEACTIVATION')

  -- 5. Verify P-256 device signature
  DeviceProofVerifier.verify(challenge, challengeSignature, publicKey)

  -- 6. Transition binding state
  UPDATE license_bindings
    SET status = 'DEACTIVATED', deactivated_at = NOW()
    WHERE license_id = $licenseId AND device_key_id = $deviceKeyId AND status = 'ACTIVE'

  -- 7. Record audit event (within same transaction)
  INSERT INTO audit_events (event_type, license_id, device_key_id, request_id, details)
  VALUES ('DEACTIVATION_SUCCEEDED', ...)

  -- 8. Record idempotency result
  UPDATE lifecycle_requests SET status = 'SUCCESS', response_payload = $result ...

COMMIT
```

**Atomicity guarantee:** Binding release, audit event, and idempotency record are committed atomically. No partial state is possible.

---

## 7. Domain Separation

Every lifecycle operation has a distinct domain separation tag:

| Operation | Domain Separation Tag |
|---|---|
| Activation (existing) | `MINIPOS-DEVICE-CHALLENGE-V1:` |
| Server Authorization (existing) | `MINIPOS-AUTHORIZATION-V1:` |
| Deactivation | `MINIPOS-DEACTIVATION-V1:` |
| Recovery | `MINIPOS-RECOVERY-V1:` |
| Admin Reset | `MINIPOS-ADMIN-RESET-V1:` |

**Formal Guarantee:** A signature over `MINIPOS-DEACTIVATION-V1: || bytes` cannot be accepted as a valid activation proof because the signed byte strings are structurally distinct even when the challenge content is identical.

---

## 8. Canonicalization

Lifecycle operations use the **identical canonicalization rules** from Phase 3:
1. Sort all JSON object keys alphabetically (recursively).
2. Remove all whitespace.
3. UTF-8 encode.
4. Apply domain separation prefix.
5. Sign/verify the resulting bytes.

This is the existing `canonicalize()` in `server/licensing/src/crypto/canonicalize.ts`. **No new canonicalization rules are introduced.**

---

## 9. Challenge Replay Protection

Lifecycle challenges reuse the established `device_challenges` table semantics from Phase 5:

| Property | Value |
|---|---|
| Entropy | 32-byte cryptographically secure random nonce |
| TTL | 60 seconds |
| Storage | `device_challenges` table (durable) |
| Single-use | Enforced atomically: `UPDATE WHERE status = 'PENDING'` |
| Operation binding | `purpose` field: `DEACTIVATION`, `RECOVERY` |
| Device binding | `deviceKeyId` field |
| License binding | `licenseId` field (deactivation only) |
| Expiry enforcement | Server-side `expires_at > NOW()` in consumption query |

**Concurrent Consumption Test:** 100 concurrent attempts to consume the same challenge result in exactly one success, because only one `UPDATE WHERE status = 'PENDING'` can return `rowCount > 0`.

---

## 10. Idempotency Design

### 10.1 New lifecycle_requests Table

```sql
CREATE TABLE lifecycle_requests (
  request_id       UUID PRIMARY KEY,
  operation        VARCHAR(32) NOT NULL,
  license_id       UUID REFERENCES licenses(id),
  device_key_id    VARCHAR(255),
  payload_hash     VARCHAR(64) NOT NULL,
  status           VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  response_payload JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);
```

### 10.2 Idempotency Semantics

| Scenario | Result |
|---|---|
| Same `requestId`, same payload, status SUCCESS | Return cached success response |
| Same `requestId`, same payload, status FAILED | Return cached failure response |
| Same `requestId`, **different payload** | Reject: LIFECYCLE_REQUEST_CONFLICT |
| Different `requestId`, same device, binding already DEACTIVATED | BINDING_NOT_FOUND |
| Client retries after response loss with same `requestId` | Return cached result |

### 10.3 Response-Loss Recovery

```
Client → Server: POST /lifecycle/deactivation (requestId: X)
Server: Commits deactivation, records SUCCESS in lifecycle_requests
Network: Response lost
Client: Timeout

Client retry → Server: POST /lifecycle/deactivation (same requestId: X)
Server: lifecycle_requests.status = SUCCESS, payload_hash matches
Server: Return cached response (no re-processing)
Client: Receives DEACTIVATED → deletes local authorization.json
```

The client **must persist** the `deactivationRequestId` until server confirmation is received.

---

## 11. Transfer Semantics

Transfer is **not a single atomic server operation**. It is a sequential two-step protocol:

```
Step 1: Device A deactivates (Section 6)
  Server: binding.status = 'DEACTIVATED'
  Client A: authorization.json deleted → NOT_ACTIVATED

Step 2: Device B activates (existing Phase 5 activation protocol)
  Server: new binding.status = 'ACTIVE'
  Client B: authorization.json written → ACTIVE
```

### 11.1 Rationale for Two-Step

| Criterion | Two-Step | Single Atomic |
|---|---|---|
| Device B must be online for deactivation? | No | Yes |
| Server must receive Device B's proof at deactivation time? | No | Yes — complex |
| Race conditions | Simpler to reason about | More complex |
| Auditability | Two clear events | One complex event |
| Recoverability | Each step independently idempotent | Complex failure modes |

### 11.2 Race Condition Analysis

**Device A deactivating, Device B activating simultaneously:**
```
T3: Device A submits deactivation → binding DEACTIVATED
T4: Device B submits activation → activeBindingCount = 0 < max → SUCCEEDS
Final: Device B ACTIVE. Device A DEACTIVATED. Correct.
```
If Device B activates before A deactivates:
```
T3: Device B submits activation → count = 1 = max → REJECTED (DEVICE_LIMIT_REACHED)
T4: Device A submits deactivation → SUCCEEDS
T5: Device B retries → count = 0 < max → SUCCEEDS
Final: Correct after retry.
```

**Device A tries to deactivate twice:**
```
T1: Device A deactivates → binding DEACTIVATED
T2: Same requestId → cached SUCCESS (idempotent)
T3: New requestId → BINDING_NOT_FOUND (no ACTIVE binding)
Final: No duplicate deactivation possible.
```

---

## 12. Lost Device Recovery Design

### 12.1 The Core Problem

When Device A is lost/destroyed, the customer cannot present a P-256 signature. The normal deactivation protocol requires this signature. Therefore, lost device recovery cannot use the device-authenticated protocol.

### 12.2 Candidate Designs Analyzed

**Option R1: Activation Code as Recovery Credential**

| Factor | Analysis |
|---|---|
| T5 (attacker with code) | **CATASTROPHIC** — attacker can recover the license |
| Social engineering risk | HIGH — attacker can phish the code |

**VERDICT: REJECTED.** The activation code creates an uncontrolled second recovery surface.

**Option R2: Account-Based Recovery Portal**

| Factor | Analysis |
|---|---|
| T5 (attacker with code) | Blocked if account has strong auth |
| Implementation complexity | Very High — requires full account system |
| Social engineering risk | HIGH — account recovery via email reset |

**VERDICT: VIABLE for V2. Not implemented in V1.**

**Option R3: Support-Assisted Admin Reset**

| Factor | Analysis |
|---|---|
| T5 (attacker with code) | Partially blocked by support verification |
| T3 (legitimate user) | Requires contacting support |
| Social engineering risk | MEDIUM — support agents can be deceived |
| Auditability | Excellent — admin action + reason logged |
| Implementation complexity | Moderate |

**VERDICT: SELECTED FOR V1.**

**Option R4: One-Time Recovery Credential (Pre-Issued at Activation)**

| Factor | Analysis |
|---|---|
| T4 (attacker with stolen device) | If attacker finds the token, they can recover |
| T3 (legitimate user) | Must safeguard the token |
| Social engineering risk | LOW |
| UX burden | HIGH for non-technical users |

**VERDICT: VIABLE for V2. UX burden too high for V1 user base (restaurant owners).**

### 12.3 Selected V1 Design: Support-Assisted Admin Reset

1. Customer contacts support with `licenseId`, proof of purchase, and new device information.
2. Support verifies customer identity against purchase records.
3. Admin calls `POST /api/v1/admin/lifecycle/release-binding` with explicit operation, target, reason, and credentials.
4. Server atomically releases the ACTIVE binding.
5. Customer activates on new device using standard activation protocol.

**Security properties:**
- Recovery requires human-verified authentication, not just a credential.
- Activation code or local files provide zero recovery capability.
- Every recovery is fully audited with admin identity and reason.

---

## 13. Admin Operations Design

### 13.1 Admin Endpoints (no generic reset endpoint)

| Operation | Endpoint | Purpose |
|---|---|---|
| Release device binding | `POST /api/v1/admin/lifecycle/release-binding` | Lost device recovery |
| Revoke license | `POST /api/v1/admin/lifecycle/revoke-license` | Commercial revocation |
| Restore license | `POST /api/v1/admin/lifecycle/restore-license` | Restore DISABLED → ACTIVE |
| Invalidate device | `POST /api/v1/admin/lifecycle/invalidate-device` | Block device permanently |
| Emergency transfer | `POST /api/v1/admin/lifecycle/emergency-transfer` | Release + prepare new activation |

### 13.2 Admin Request Schema

```json
{
  "adminRequestId": "uuid-v4",
  "operation": "release-binding",
  "targetLicenseId": "uuid",
  "targetDeviceKeyId": "hex or null",
  "reason": "string (required, min 20 chars)",
  "adminId": "string",
  "timestamp": "ISO8601"
}
```

### 13.3 Admin Authentication Requirements (Phase 11 implementation)

- **Credentials**: bcrypt-hashed, stored in environment variables or secure vault. NEVER in the database in plaintext.
- **Comparison**: `crypto.timingSafeEqual` — constant-time comparison prevents timing attacks.
- **Rate limiting**: Max 10 requests/minute/IP, lockout after 5 consecutive failures.
- **Audit logging**: Every admin request (success or failure) written to `audit_events` with `adminId`, `reason`, `targetLicenseId`.
- **TLS**: All admin operations must use TLS.
- **Authorization boundary**: Admin credentials must not share scope with customer-facing activation credentials.

**Known gap documented for Phase 11:** The current `LicenseService.revokeLicense()` has no admin authentication check. Any API caller can revoke a license. Phase 11 must add admin middleware to all admin-facing routes.

### 13.4 Admin vs Customer Rate Limits

| Category | Authentication | Rate Limit | Audited |
|---|---|---|---|
| Customer activation | Device P-256 proof | 20/min/IP | Yes |
| Customer deactivation | Device P-256 proof | 10/min/IP | Yes |
| Admin lifecycle | Admin credential | 10/min/IP, lockout@5 | Yes + reason |
| Admin license creation | Admin credential | 5/min/IP | Yes |
| Admin revocation | Admin credential | 5/min/IP | Yes |

---

## 14. State Machines

### 14.1 Server-Side License State

```
ACTIVE ──→ EXPIRED  (natural: now >= valid_until)
ACTIVE ──→ REVOKED  (admin action, terminal)
ACTIVE ──→ DISABLED (admin action)
DISABLED → ACTIVE   (admin action)
EXPIRED  (terminal — cannot transition back)
REVOKED  (terminal — cannot be restored)
```

### 14.2 Server-Side Device Binding State

```
[not exists]
    │
    │ (activation)
    ▼
  ACTIVE ────────────────────────────────────────────┐
    │                                                  │
    │ (voluntary deactivation)                         │ (admin release-binding)
    ▼                                                  │
DEACTIVATED                                           │
    │                                                  │
    │ (re-activation allowed via fresh challenge)      │
    └──────────────────────────────────────────────────┘
    
ACTIVE ──(admin invalidate)──→ INVALIDATED (terminal: cannot reactivate)
```

**Binding state semantics:**

| State | Slot consumed? | Can reactivate? |
|---|---|---|
| ACTIVE | YES | N/A |
| DEACTIVATED | NO | YES (new challenge) |
| INVALIDATED | NO | NO |

### 14.3 Client Runtime State (Phase 7, unchanged)

```
NOT_ACTIVATED | ACTIVE | EXPIRED | INVALID_AUTHORIZATION |
DEVICE_MISMATCH | CLOCK_ANOMALY | DEVICE_IDENTITY_UNAVAILABLE | STORAGE_ERROR
```

After successful server deactivation: client transitions to `NOT_ACTIVATED`.

### 14.4 Client-Server State Divergence

| Server Binding | Client auth.json | Client Runtime |
|---|---|---|
| ACTIVE | present, valid | ACTIVE |
| ACTIVE | deleted | NOT_ACTIVATED (server unaware) |
| DEACTIVATED | deleted | NOT_ACTIVATED |
| DEACTIVATED | still present (response-loss) | ACTIVE locally (retry resolves) |
| License REVOKED | present, unexpired | ACTIVE (offline — see §18) |
| License REVOKED | expired | EXPIRED |

**Policy:** The client cannot infer that the server binding is released because its local file is absent. These states are independent.

---

## 15. Response-Loss Scenarios

### 15.1 Deactivation: Server Commits, Response Lost

```
Client  → Server: POST /lifecycle/deactivation (requestId: X)
Server  : commits deactivation, records lifecycle_requests SUCCESS
Network : response lost
Client  : timeout

Client retry (same requestId: X)
Server  : lifecycle_requests.status = SUCCESS, payload_hash matches
Server  : returns cached response
Client  : receives DEACTIVATED → deletes auth.json → NOT_ACTIVATED
```

### 15.2 Admin Reset: Response Lost

Admin retries with the same `adminRequestId` and same payload → cached result returned. No double-execution.

---

## 16. Offline Deactivation

**Deactivation is an ONLINE operation. This is non-negotiable.**

There is no safe way to perform offline deactivation that:
1. Guarantees the server slot is freed.
2. Prevents Device A from "locally deactivating" and then fraudulently re-using the slot.

**When offline during deactivation attempt:**
- Error: `SERVER_UNAVAILABLE`
- Local `authorization.json` is NOT deleted.
- Runtime state remains `ACTIVE`.
- User cannot transfer license until online.

This is consistent with §19 of `licensing-specification-v1.md`.

---

## 17. Local State After Deactivation

**Strict ordering:**
```
1. POST /lifecycle/deactivation → await HTTP 200
2. Delete authorization.json (atomic delete)
3. Recompute runtime state → NOT_ACTIVATED
4. Broadcast NOT_ACTIVATED to renderer
```

Local authorization MUST NOT be deleted before server confirmation.

**Step 1 fails (network):** Retain auth.json, runtime stays ACTIVE, user retries.

**Step 2 fails (disk error after server success):**
- Server binding is DEACTIVATED.
- Client may still have auth.json.
- Local runtime will be ACTIVE locally; server sees DEACTIVATED.
- Next retry with same `requestId` → server returns cached DEACTIVATED.
- **Phase 11 mitigation:** After server success, record a `pending_deactivation_cleanup` flag. On next launch, detect and complete deletion before initializing.

---

## 18. Revocation Semantics and Offline Implications

### 18.1 Revocation Mechanism

When admin revokes via `POST /api/v1/admin/lifecycle/revoke-license`:
1. `licenses.status = 'REVOKED'` on server.
2. Existing ACTIVE device bindings remain ACTIVE in `license_bindings`.
3. Future activation attempts return `LICENSE_REVOKED`.

### 18.2 Offline Client After Server Revocation

Because Mini POS is offline-first, a revoked license:
- **Cannot be detected** by an offline client.
- Local `authorization.json` remains cryptographically valid until `validUntil`.
- Client runtime remains `ACTIVE` until authorization expires.
- An online request surfaces the revocation.

**This is an explicit, accepted residual risk:**
> A revoked license continues to operate on a disconnected machine until the natural `validUntil` expiry.
> Mitigation: Issue licenses with practical validity terms (e.g., 1-year).

**No heartbeat, periodic check, or network check is introduced.** The offline-first invariant (SEC-LIFE-014) is preserved absolutely.

---

## 19. Device Key Loss

### 19.1 Scenario
Device physically exists but Secure Enclave / native identity key is inaccessible (OS reinstall, hardware failure, TPM reset).

### 19.2 System Behavior
- `identityProvider.getStatus()` returns `KEY_MISSING`.
- `LicensingService` fails closed with `SECURE_IDENTITY_UNAVAILABLE`.
- Runtime state: `DEVICE_IDENTITY_UNAVAILABLE`.
- Billing blocked.

### 19.3 Cannot Distinguish Key Loss from Attacker

The system **cannot automatically distinguish**:
- Legitimate customer whose OS reinstall wiped the keychain.
- Attacker attempting to generate a new key and claim the existing license.

**Correct response for both cases:** Support-assisted admin reset with out-of-band identity verification.

### 19.4 Replacement Device Protocol

After admin releases the old binding:
1. Device generates a new key pair (new `deviceKeyId`).
2. Device activates with the original license key (standard activation protocol).
3. Server sees this as a new device activation.

**No automatic identity inheritance.** The old `authorization.json` will fail with `DEVICE_MISMATCH`. This is correct.

---

## 20. Security Invariants

| ID | Invariant |
|---|---|
| SEC-LIFE-001 | Only the currently bound device (via its private key) or an explicitly authorized administrative recovery mechanism may deactivate a binding. |
| SEC-LIFE-002 | `licenseId` alone is insufficient to deactivate or transfer a device. |
| SEC-LIFE-003 | Device proof must be operation-specific: a valid deactivation proof cannot be accepted as an activation proof. |
| SEC-LIFE-004 | Lifecycle challenges are single-use. Consuming a challenge atomically prevents duplicate consumption. |
| SEC-LIFE-005 | Lifecycle requests are idempotent: the same `requestId` with the same payload always returns the same result. |
| SEC-LIFE-006 | Different payloads sharing the same `requestId` are rejected with LIFECYCLE_REQUEST_CONFLICT. |
| SEC-LIFE-007 | Concurrent deactivation operations cannot violate binding invariants: the license row is locked with `FOR UPDATE`. |
| SEC-LIFE-008 | Local file copying cannot establish ownership. Only server binding + device proof establish ownership. |
| SEC-LIFE-009 | A new device cannot impersonate the old device. Each `deviceKeyId` has its public key registered once; it cannot be replaced. |
| SEC-LIFE-010 | Local authorization deletion cannot create a server-side transfer. The server binding remains ACTIVE until a valid, authenticated deactivation is received. |
| SEC-LIFE-011 | Every administrative lifecycle operation is audited with operation, admin ID, reason, timestamp, and outcome. |
| SEC-LIFE-012 | Recovery cannot be reduced to possession of a public artifact (auth file, activation code). Recovery requires admin-verified identity. |
| SEC-LIFE-013 | No lifecycle operation bypasses the existing cryptographic trust model (P-256 device proof + Ed25519 server authorization). |
| SEC-LIFE-014 | Offline operation remains offline. No lifecycle operation introduces periodic network checks. |
| SEC-LIFE-015 | No technical lease, heartbeat, or grace period is introduced by lifecycle operations. |

---

## 21. Security Questions: Formal Answers

1. **Can Device B deactivate Device A?**
   NO. Requires Device A's private key signature. Device B cannot produce it.

2. **Can Device B transfer A's license without A?**
   NO. Transfer requires deactivation of A as step 1 (requires A's key). Without admin intervention, B cannot act without A's cooperation.

3. **Can possession of the activation code alone perform deactivation?**
   NO. Deactivation uses P-256 challenge-response. The activation code is not presented.

4. **Can a copied authorization file authorize recovery?**
   NO. Auth file is not a recovery credential. Recovery requires admin action with purchase verification.

5. **Can a replayed deactivation request succeed twice?**
   NO. Same `requestId` → cached idempotent response. New `requestId` → BINDING_NOT_FOUND.

6. **Can a replayed recovery request succeed twice?**
   NO. Admin reset records idempotency. Same `adminRequestId` + same payload → cached result.

7. **Can two devices race for one available license slot?**
   Determined by DB transaction ordering. Exactly one succeeds; the other gets DEVICE_LIMIT_REACHED.

8. **Can response loss produce an unrecoverable half-state?**
   NO. Client retries with same `requestId`; server returns cached result.

9. **Can local deletion alone transfer a license?**
   NO. Local deletion sends no network request. Server binding remains ACTIVE.

10. **Can local file restoration undo server-side deactivation?**
    PARTIALLY. The restored auth.json may verify locally (if unexpired + same deviceKeyId). But the server binding is DEACTIVATED. Any new online action surfaces the server state.

11. **Can a malicious renderer perform deactivation?**
    NO. Renderer invokes IPC but Main orchestrates the proof (Secure Enclave, not renderer). Renderer cannot fabricate P-256 signature.

12. **Can a malicious renderer perform recovery?**
    NO. Recovery requires admin action on the server.

13. **Can an admin action occur without an audit event?**
    NO. Admin operation and audit event are committed in the same transaction.

14. **Can a stale lifecycle request overwrite a newer server state?**
    NO. Requests are idempotent by `requestId`. A new `requestId` on an already-DEACTIVATED binding returns BINDING_NOT_FOUND. State cannot be rolled back.

15. **Can a recovery token be replayed?**
    V1 uses admin-assisted recovery, not tokens. If V2 introduces tokens: must be single-use (atomic consumption), expiring (TTL), operation-bound, and device-bound.

---

## 22. Audit Events

### 22.1 Required Events

| Event Type | Trigger | Required Fields |
|---|---|---|
| `DEACTIVATION_REQUESTED` | Client requests challenge | licenseId, deviceKeyId, requestId |
| `DEACTIVATION_SUCCEEDED` | Server commits deactivation | licenseId, deviceKeyId, requestId |
| `DEACTIVATION_IDEMPOTENT` | Cached result returned | licenseId, deviceKeyId, requestId |
| `DEACTIVATION_REJECTED` | Deactivation fails validation | licenseId, deviceKeyId, requestId, reason |
| `DEACTIVATION_REPLAY` | Challenge replay detected | challengeId, deviceKeyId |
| `ADMIN_RELEASE_BINDING` | Admin releases a device binding | adminId, licenseId, deviceKeyId, reason |
| `ADMIN_REVOKE_LICENSE` | Admin revokes a license | adminId, licenseId, reason |
| `ADMIN_RESTORE_LICENSE` | Admin restores a license | adminId, licenseId, reason |
| `ADMIN_INVALIDATE_DEVICE` | Admin invalidates a device | adminId, deviceKeyId, licenseId, reason |
| `ADMIN_EMERGENCY_TRANSFER` | Admin emergency transfer | adminId, licenseId, oldDeviceKeyId, reason |
| `RECOVERY_REQUESTED` | Customer initiates recovery | licenseId, contactEmail |
| `RECOVERY_COMPLETED` | Admin completes recovery | adminId, licenseId, reason |

### 22.2 Schema Extension

```sql
-- Add admin_id to existing audit_events table
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS admin_id VARCHAR(255);
```

### 22.3 What Must NOT Be Logged

- Device private key material
- Server signing private keys
- Full challenge nonces (challengeId sufficient)
- Activation codes in plaintext
- Full cryptographic signatures (requestId sufficient)
- Admin credentials

---

## 23. Rate Limiting

| Endpoint | Limit | Window | Per |
|---|---|---|---|
| `POST /lifecycle/deactivation/challenge` | 10 requests | 15 min | IP |
| `POST /lifecycle/deactivation` | 5 requests | 15 min | IP + deviceKeyId |
| `POST /admin/lifecycle/*` | 10 requests | 1 min | IP |
| Admin consecutive failures | lockout after 5 | 30 min lockout | IP |

Idempotency retries (same `requestId`) bypass rate limits to ensure legitimate response-loss recovery.

---

## 24. Authorization Code Security

After activation, the activation code has no operational role:
- **Deactivation** does NOT require the activation code.
- **Recovery** does NOT accept the activation code as proof.
- The activation code is NEVER stored on the client after activation.

**Attack: Attacker obtains activation code:**
- Without device private key → cannot deactivate.
- Cannot transfer without admin assistance.
- Cannot recover without admin identity verification.

**Must NOT allow:** The admin recovery process must NOT accept the activation code as proof of ownership. Admin must verify through purchase records, not the activation code.

---

## 25. Attack Matrix

| ID | Scenario | Threat | Expected Result | Control | Residual Risk |
|---|---|---|---|---|---|
| A | Valid Device A deactivation | T1 | DEACTIVATED, slot freed | P-256 challenge-response | None |
| B | Device B attempts Device A deactivation | T2 | REJECTED: invalid signature | B lacks A's private key | None |
| C | Stolen activation code attempts deactivation | T5 | REJECTED: no device key | Deactivation requires P-256 proof | None |
| D | Replay old deactivation request (same requestId) | T10 | IDEMPOTENT: cached result | Idempotency cache | None |
| E | Replay consumed challenge | T10 | REJECTED: CHALLENGE_REPLAYED | Atomic challenge consumption | None |
| F | Activation proof used for deactivation | T10 | REJECTED: wrong domain/purpose | Domain separation tags | None |
| G | Device A/B concurrent transfer | T12 | Deterministic: one wins, one retries | FOR UPDATE transaction locks | None |
| H | Copied auth file used for recovery | T6 | REJECTED: recovery requires admin | No auth-file-based recovery | None |
| I | Lost-device legitimate recovery | T3 | ALLOWED: via admin reset + re-activation | Admin identity verification | Social engineering risk |
| J | Malicious recovery request | T5/T4 | REJECTED: admin verification fails | Admin reviews purchase records | Weak verification |
| K | Admin reset (legitimate) | — | SUCCEEDED: full audit trail | Admin credentials + audit | Admin compromise |
| L | Forged admin request | T13 | REJECTED: invalid admin credentials | Constant-time comparison | None |
| M | Response lost after server commit | — | IDEMPOTENT: retry succeeds | lifecycle_requests cache | None |
| N | Duplicate request after server commit | — | IDEMPOTENT: same cached result | lifecycle_requests cache | None |
| O | Local clock manipulation | T7 | CLOCK_ANOMALY detection applies | lastKnownTrustedTime (existing) | Minor window |
| P | Old local authorization restored after deactivation | T6 | Locally valid offline; server sees DEACTIVATED | Short authorization TTLs | Offline delay |
| Q | Native key lost (device exists) | T3 | DEVICE_IDENTITY_UNAVAILABLE; requires admin reset | Support-assisted recovery | Social engineering |
| R | Renderer IPC lifecycle attack | T8 | Main orchestrates proof; renderer cannot fabricate signature | Secure Enclave boundary | None |

---

## 26. Residual Risks

1. **Social Engineering in Support Recovery (MEDIUM)**
   The admin recovery process depends on human verification. A sophisticated attacker can fabricate purchase records or deceive support agents.
   *Mitigation:* Support must verify through purchase order ID matched to payment processor records, not just email.

2. **Offline Revocation Delay (LOW-MEDIUM)**
   A revoked license continues to operate on a disconnected machine until `validUntil`.
   *Mitigation:* Issue licenses with reasonable validity terms (1-year).

3. **Admin Credential Compromise (HIGH IMPACT, LOW LIKELIHOOD)**
   A compromised admin credential allows unlimited license manipulation. All admin operations are audited, providing forensic traceability.
   *Mitigation:* Strong credential management, MFA for admin access, regular rotation.

4. **Binary Patching (MEDIUM IMPACT, LOW LIKELIHOOD for casual piracy)**
   An attacker with debugger access can bypass client-side enforcement. This is an accepted residual risk of client-side software.
   *Mitigation:* Code signing raises skill floor required.

5. **Local Authorization Restoration After Server Deactivation (LOW)**
   A backed-up `authorization.json` can be restored after server deactivation and will verify locally if unexpired and the device key still matches.
   *Mitigation:* Issue shorter authorization durations after deactivation is confirmed.

6. **Device Key Loss Without Clear Cause (LOW)**
   Legitimate customers may lose their device key due to OS issues. The support channel is the recovery path; friction is unavoidable.

---

## 27. Phase 2–9 Dependencies to Preserve

| Component | Must Not Be Changed | Phase 11 Dependency |
|---|---|---|
| `ChallengeService.createChallenge()` | Reused for lifecycle challenges | Extend `licenseId` parameter |
| `ChallengeService.consumeChallenge()` | Reused atomically | No change needed |
| `DeviceProofVerifier.verifyAndConsume()` | Reused for deactivation proof | No change needed |
| `AuditService.recordEvent()` | Reused in lifecycle transactions | Add `admin_id` parameter |
| `ActivationService` | Must not be modified | New `DeactivationService` is separate |
| `license_bindings` table | Add `deactivated_at`, `status` column | Migration needed |
| `device_challenges` table | Extend for new purposes | No schema change (purpose is string) |
| `LicensingBillingGate` | Must not be changed | Not involved in lifecycle |
| `LicensingRuntimeService` | Add deactivation trigger path | Add `clearLocalAuthorization()` |
| `LocalAuthorizationStore` | Add `delete()` method | Current API may only read/write |

---

## 28. Phase 11 Implementation Plan

### Step 1: Server Database Schema Changes
```sql
CREATE TABLE lifecycle_requests (
  request_id       UUID PRIMARY KEY,
  operation        VARCHAR(32) NOT NULL,
  license_id       UUID REFERENCES licenses(id),
  device_key_id    VARCHAR(255),
  payload_hash     VARCHAR(64) NOT NULL,
  status           VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  response_payload JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

ALTER TABLE license_bindings
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS admin_id VARCHAR(255);
```

### Step 2: Lifecycle Challenge Endpoint
- `POST /api/v1/lifecycle/deactivation/challenge`
- Input: `{ deviceKeyId, licenseId }`
- Creates challenge with `purpose: 'DEACTIVATION'` and `licenseId` binding.

### Step 3: DeactivationService
New file: `server/licensing/src/services/DeactivationService.ts`
- `executeDeactivation(client, requestId, licenseId, deviceKeyId, challenge, signature)`
- Reuses `DeviceProofVerifier.verifyAndConsume()` with purpose `'DEACTIVATION'`
- Manages `lifecycle_requests` idempotency

### Step 4: Deactivation Route
- `POST /api/v1/lifecycle/deactivation`
- Rate limiting middleware
- Zod schema validation
- Returns `{ status: 'DEACTIVATED', deactivationId, timestamp }`

### Step 5: AdminLifecycleService
New file: `server/licensing/src/services/AdminLifecycleService.ts`
- `releaseBinding(client, adminId, licenseId, deviceKeyId, reason)`
- `revokeLicense(client, adminId, licenseId, reason)`
- `restoreLicense(client, adminId, licenseId, reason)`
- `invalidateDevice(client, adminId, deviceKeyId, reason)`

### Step 6: Admin Authentication Middleware
New file: `server/licensing/src/middleware/adminAuth.ts`
- Constant-time credential comparison (`crypto.timingSafeEqual`)
- Rate limiting and lockout
- Injects `adminId` into request context
- Mandatory audit logging wrapper

### Step 7: Admin Routes
- `POST /api/v1/admin/lifecycle/release-binding`
- `POST /api/v1/admin/lifecycle/revoke-license`
- `POST /api/v1/admin/lifecycle/restore-license`
- All protected by `adminAuth` middleware

### Step 8: Client LicensingLifecycleService
New file: `electron/licensing/LicensingLifecycleService.ts`
- `requestDeactivation(): Promise<void>`
  - Gets challenge from server
  - Signs challenge via `IDeviceIdentityProvider.signChallenge()`
  - Submits deactivation request
  - On success: calls `LocalAuthorizationStore.delete()`
  - Triggers `LicensingRuntimeService.refresh()`

### Step 9: Local State Changes
- `LocalAuthorizationStore.delete()` — atomic deletion of `authorization.json`
- `LicensingRuntimeService`: Add `deactivate()` method

### Step 10: IPC Extension
- New IPC channel: `license:deactivate`
- Handler in `electron/ipc/licensing.handlers.ts`
- Renderer: `window.api.licensing.deactivate()`

### Step 11: Deactivation UI
- Settings page: "Deactivate License" button
- Confirmation dialog with clear consequences
- Loading state during deactivation
- Error handling: `SERVER_UNAVAILABLE`, `BINDING_NOT_FOUND`, etc.
- Success: transitions to `ActivationScreen`

### Step 12: Recovery Flow Documentation
- `docs/support-recovery-process.md` — step-by-step support procedure
- Add support contact info to `DEVICE_IDENTITY_UNAVAILABLE` UI state

### Step 13: Tests
- **Unit:** `DeactivationService` (idempotency, concurrency, state transitions)
- **Unit:** `AdminLifecycleService` (all operations)
- **Unit:** `adminAuth` middleware (constant-time comparison, rate limiting)
- **Integration:** Full deactivation flow (challenge → sign → submit → verify state)
- **Integration:** Replay attack on deactivation challenge
- **Integration:** 100 concurrent deactivation attempts (exactly one succeeds)
- **Integration:** Response-loss retry (same requestId)
- **Integration:** Admin release-binding
- **E2E:** Deactivation from settings UI → NOT_ACTIVATED
- **E2E:** Deactivation offline → error displayed

### Step 14: Migration Strategy
1. Add `lifecycle_requests` (additive, no breaking change).
2. Add `status` column to `license_bindings` with `DEFAULT 'ACTIVE'` (all existing rows get ACTIVE).
3. Add `deactivated_at` (nullable, no breaking change).
4. Add `admin_id` to `audit_events` (nullable, no breaking change).
5. Deploy server first, then client.

### Step 15: Rollback Strategy
- **Server routes:** Remove new endpoints → reverts to no-deactivation (safe).
- **Database:** All schema changes are additive. Rollback requires removing new tables/columns (safe if no data yet).
- **Client:** Remove IPC channel and lifecycle service → no deactivation UX.

---

## 29. Acceptance Criteria

- [x] No lifecycle production implementation was added.
- [x] Deactivation terminology is formally defined.
- [x] Transfer terminology is formally defined.
- [x] Recovery terminology is formally defined.
- [x] Revocation is distinguished from deactivation.
- [x] Lost-device recovery threat model is complete.
- [x] Device-proof requirements are defined.
- [x] Lifecycle challenge requirements are defined.
- [x] Domain separation is defined.
- [x] Canonicalization rules are defined.
- [x] Replay protection is defined.
- [x] Idempotency semantics are defined.
- [x] Concurrency semantics are defined.
- [x] Response-loss semantics are defined.
- [x] Database invariants are defined.
- [x] Audit requirements are defined.
- [x] Offline implications are explicitly documented.
- [x] Server revocation vs offline authorization behavior is documented.
- [x] Activation-code abuse scenarios are analyzed.
- [x] Copied-local-file recovery attacks are analyzed.
- [x] Secure device-key loss is analyzed.
- [x] Admin recovery is formally constrained.
- [x] Renderer cannot become lifecycle authority.
- [x] Phase 8 billing enforcement remains untouched.
- [x] Phase 9 UI remains untouched.
- [x] No technical lease introduced.
- [x] No grace period introduced.
- [x] No heartbeat introduced.
- [x] No periodic mandatory licensing network check introduced.
- [x] Phase 10 specification is created.
- [x] Phase 10 threat model is created.
- [x] Phase 11 implementation plan is included.

---

*Document: `docs/phase-10-lifecycle-security-specification.md`*
*Phase: 10 (Design/Specification Only)*
*Status: COMPLETE*
*No production code was modified.*
