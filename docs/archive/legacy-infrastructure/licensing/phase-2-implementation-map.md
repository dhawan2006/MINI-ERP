# Phase 2 Electron Client Implementation Map

## 1. Shared Crypto & Data Models
- **`src/shared/crypto/RuntimeCheckinReceiptPayload.ts`**
  Defines `SignedRuntimeCheckinReceipt`, `RuntimeCheckinReceiptPayload`, `RuntimeDirective`.
- **`src/shared/crypto/RuntimeCheckinReceiptVerifier.ts`**
  Cryptographically verifies `SignedRuntimeCheckinReceipt`. Prepend `MINIPOS-RUNTIME-CHECKIN-V1:`. Validates strict schema and timestamps (`checkInValidUntil`, `policyVersion`).

## 2. Infrastructure (Persistence)
- **`src/infrastructure/licensing/LocalRuntimeStateStore.ts`**
  Provides atomic, crash-safe persistence for the signed receipt to disk (e.g. `runtime-checkin.auth`), mirroring `LocalAuthorizationStore`.

## 3. Client API Updates
- **`electron/licensing/LicensingClient.ts`**
  Add endpoints `requestRuntimeCheckInChallenge(deviceKeyId)` and `performRuntimeCheckIn(...)`.

## 4. Main Process Logic
- **`electron/licensing/RuntimeCheckInCoordinator.ts`** (NEW)
  Automatic check-in engine.
  - Inspects current state.
  - Handles exponential backoff / retry on network failure.
  - Enforces concurrency guard (prevents request storms).
  - Handles "Verify Now" requests.
- **`electron/licensing/LicensingRuntimeService.ts`** (MODIFIED)
  The central state machine.
  - Composes `LicensingService` (billing authorization) + `RuntimeCheckInCoordinator` (check-in receipt validity).
  - Determines combined state (e.g. `ACTIVE` + `DUE SOON` -> warning; `ACTIVE` + `DEADLINE EXCEEDED` -> billing denied).
  - Integrates existing clock rollback protections with the new server-provided timestamp.

## 5. IPC & UI Integration
- **`src/shared/licensing-dto.ts`** (MODIFIED)
  Extend `LicensingStatusDTO` with check-in state, `checkInValidUntil`, warning status, and pending directives.
- **`electron/main.ts`** (MODIFIED)
  Initialize `RuntimeCheckInCoordinator`, wire up triggers (startup, resume). Add IPC handlers for `license:verifyNow` and `license:acknowledgeDirective`.
- **Renderer UI** (To be implemented later / in part)
  Display warnings (48h/24h/6h thresholds), "Verify Now" button, blocked billing overlay when `DEADLINE EXCEEDED`.

## 6. Testing Strategy
- Unit tests for `RuntimeCheckinReceiptVerifier` and State Machine computation.
- Modify `LicensingClient.ts` to mock out network responses for playwright E2E scenarios.
- Run complete Playwright matrix verifying offline states and expiry bounds.
