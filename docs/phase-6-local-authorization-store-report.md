# Mini POS — Phase 6 Local Authorization Store Report

## 1. Phase 6 Objective
The objective of Phase 6 was to make the successful server activation authorization DURABLE across restarts while strictly enforcing all cryptographically validated invariants locally. The local storage logic was isolated behind `ILocalAuthorizationStore` and the verification process embedded deeply into the application flow using `LicensingService`.

## 2. Files Added/Modified
**Added:**
- `src/application/interfaces/ILocalAuthorizationStore.ts`
- `src/infrastructure/licensing/LocalAuthorizationStore.ts`
- `src/application/use-cases/LicensingService.ts`
- `tests/licensing/local-store.test.ts`

**Modified:**
- `server/licensing/src/crypto/AuthorizationVerifier.ts` (removed unused import)

## 3. Local Authorization Format
The application strictly preserves the original `SignedAuthorization` JSON object exactly as retrieved from the server during Phase 5 activation. No transformations, weakening of cryptography, or ad-hoc representations are accepted. 

## 4. Storage Location
Stored strictly separately from the business SQLite databases. 
Location: `<userData>/licensing/authorization.json`.

## 5. Verification Flow
1. Load file (strict JSON parsing checks).
2. Invoke `AuthorizationVerifier` to validate the Ed25519 signature and payload schema bounds.
3. Fetch cryptographic `deviceKeyId` from the `NativeDeviceIdentityAdapter`.
4. Enforce Device Binding (`auth.deviceKeyId === expectedDeviceKeyId`).
5. Enforce precise time validity (`auth.validFrom <= currentTime < auth.validUntil`).
6. Update in-memory state securely.

## 6. Atomic Write Strategy
All saves are performed using a temporary crash-safe approach:
1. `JSON.stringify` to `<userData>/licensing/authorization.json.tmp`.
2. Atomic `fs.rename` (POSIX specification compliant atomicity) to `authorization.json`.
3. Ensures partial disk space/power failures do not leave a zero-byte or corrupt primary authorization file.

## 7. Crash Recovery Behavior
If a crash occurs during a save, a stale `.tmp` file might be left, but the core `authorization.json` is left perfectly intact as the previous valid state. This is aggressively tested.

## 8. Corruption Handling
Corrupted JSON, schema violations, missing signatures, or unexpected data types all securely throw explicit subclasses of `LocalAuthorizationError` (e.g., `AUTHORIZATION_MALFORMED`, `AUTHORIZATION_SIGNATURE_INVALID`). The `LicensingService` safely catches these and defaults to a `"fail closed"` posture reporting `NOT_ACTIVATED` or the explicit error. No malformed JSON gets loaded.

## 9. Device Mismatch Handling
The loaded `deviceKeyId` must strictly equal the active native device identity string. If a valid authorization file is blindly copied from Device A to Device B, Device B will detect a mismatch and fail closed with `AUTHORIZATION_DEVICE_MISMATCH`.

## 10. Key-Loss Behavior
If the Enclave identity is lost/missing, `identityProvider.getStatus()` reports `KEY_MISSING`. The `LicensingService` intercepts this and immediately refuses to initialize any authorization state, logging a `SECURE_IDENTITY_UNAVAILABLE` error and failing closed. No "fallback software key" is generated.

## 11. Anti-Rollback Behavior
Enforced via the `issuedAt` monotonic property. The `LicensingService` ensures you cannot `.saveNewAuthorization()` if the new authorization has an `issuedAt` older than the one currently valid on disk. 
**Constraint Documented:** Because a hardware-backed high-water mark could not be integrated into the native Swift layer in this scope (as the instructions strictly forbade inventing unsafe workarounds if the protocol lacked support), an attacker fully deleting the file will erase the anti-rollback baseline. 

## 12. Offline Behavior
Startup explicitly initializes completely offline. It reads the local file, cryptographic primitives, and Native Enclave offline. If the system clock sits safely within the valid window, it authorizes the session.

## 13. Backup/Restore Interaction
The licensing store resides explicitly outside of `billing.db`. Currently, backups handle SQLite artifacts, thus backing up business data does not inherently back up (or restore/bypass) the machine's licensing identity or authorization files.

## 14. Security Invariants Verified
- **SEC-LOCAL-001**: Local authorization is rejected when signatures are modified.
- **SEC-LOCAL-002**: Authorization is cryptographically device-bound.
- **SEC-LOCAL-003**: Offline startup works flawlessly.
- **SEC-LOCAL-004**: Malformed/corrupted files fail closed.
- **SEC-LOCAL-006**: Atomic persistence prevents partial writes.
- **SEC-LOCAL-007**: Key loss fails closed securely.
- **SEC-LOCAL-008**: Independent from billing DB.
- **SEC-LOCAL-013**: Copying to another device is rejected.

## 15. Tests Added
18 complete integration tests were written inside `tests/licensing/local-store.test.ts` focusing deeply on atomic writes, key tampering, offline startup, time bounding, concurrency edge cases, and file-level recovery.

## 16. Exact Test Results
- **Phase 6 Suite (`local-store.test.ts`)**: 18 tests, 18 passed.
- **Phase 5 Suite (`activation-integration.test.ts`)**: 5 tests, 5 passed.
- **Phase 4 Suite (`device-identity.test.ts`)**: 22 tests, 22 passed.
- All other pre-existing infrastructure and UI tests passed successfully via `npm run test` and `npm run build`.

## 17. Manual Tests Performed
Test A (Fresh State): Service evaluates correctly to `isActivated: false` on an empty directory.
Test B (Persistence): Signed Authorization JSON writes atomically and returns immediately via `isActivated: true`.
Test D (File Tampering): Overwriting `"protocolVersion": 1` to `2` strictly failed signature verification.

## 18. Known Limitations
- Deletion of the local `authorization.json` file completely resets the anti-rollback capability since there is no secure-enclave hardware counter/high-water-mark tied to the Phase 4 helper application yet.
- The system is still purely evaluating memory variables. True "Billing enforcement" (refusing to let the application perform business functions when `isActivated: false`) belongs to a future phase.
- A fully controlled client machine can potentially be instrumented to bypass the memory checks. The local authorization provides a robust integrity envelope, not impenetrable DRM.

## 19. Deferred Decisions
- How the renderer actually asks for activation or surfaces offline errors (Phase 7+ UI).
- IPC boundary implementations for exposing the parsed `LicensingState` to the renderer cleanly (to be implemented alongside UI bindings).

## 20. Scope Confirmation
- No future-phase features were implemented.
- No React GUI added.
- No Billing Gate logic added.
- No technical leases or network heartbeat checks created.
- Application logic remained 100% focused on offline safe storage and recovery.
