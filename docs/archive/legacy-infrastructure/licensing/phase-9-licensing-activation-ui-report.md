# Phase 9: Licensing Activation UI & Lifecycle Presentation Report

## 1. Objective
The objective of Phase 9 was to implement the customer-facing interface for the Mini POS licensing system. The UI must cleanly reflect the licensing state governed by the Main process without ever acting as the licensing authority itself. Phase 9 implements the first-run activation flow, safe offline continuation, explicit error state mapping, and UX for gracefully handling licensing expirations without destructive data loss.

## 2. UI Architecture
The UI follows a unidirectional, read-only presentation architecture:
1. **Renderer (React/Zustand)** queries and listens to licensing state (`LicensingStatusDTO`) through `window.api.licensing`.
2. **Renderer** conditionally mounts either the Activation Screen (`NOT_ACTIVATED`), the main POS interface (`ACTIVE`), or the appropriate safe failure boundary (`EXPIRED`, `INVALID_AUTHORIZATION`, etc.).
3. **Renderer** is strictly a presentation layer. It never directly computes expiration logic from dates, nor does it attempt to cryptographically verify payloads.
4. **Main Process (LicensingRuntimeService)** retains absolute authority over the current licensing state and broadcasts state changes to the renderer.

## 3. Activation Flow
1. User inputs the activation code in the `ActivationScreen`.
2. The renderer submits this code via the secure IPC channel (`window.api.licensing.activate(code)`).
3. The renderer sets a local loading state to prevent duplicate submissions, but relies entirely on Main to complete the operation.
4. The Main process orchestrates the multi-step activation:
    - Generates a cryptographic device challenge/proof.
    - Submits the proof and activation code to the licensing server.
    - Receives a `SignedAuthorization` payload.
    - Cryptographically verifies the payload against the server's public key.
    - Ensures the device ID matches the current hardware.
    - Atomically persists the authorization to disk.
5. Only if **all** the above succeed, Main transitions to `ACTIVE` and broadcasts the new state.
6. The renderer immediately receives the `ACTIVE` broadcast and seamlessly mounts the POS workflow.

## 4. IPC Flow
The IPC contract is intentionally narrow:
- `ipcRenderer.invoke('license:getState')` -> Returns the latest `LicensingStatusDTO`.
- `ipcRenderer.invoke('license:activate', code)` -> Triggers the Main activation flow.
- `ipcRenderer.on('license:stateChanged')` -> Receives push updates from Main when expiration or state re-evaluations occur.

There are no generic `send` pathways or backdoor "set active" endpoints.

## 5. State Presentation
The `LicensingStatusDTO` maps into exact UX boundaries:
- **`NOT_ACTIVATED`**: Shows `ActivationScreen.tsx`.
- **`ACTIVE`**: Full access to normal application layouts (Billing, History, Products, Settings).
- **`EXPIRED`**: Shows `LicensingBanner.tsx` blocking the specific billing functionality but allowing history and data review.
- **`DEVICE_MISMATCH` / `INVALID_AUTHORIZATION` / `CLOCK_ANOMALY` / `STORAGE_ERROR`**: Present safe, actionable fallback states, preventing revenue finalization but explaining the context securely to the merchant.

## 6. Activation Success Semantics
Success is **never** assumed just because the HTTP request returned 200. The user is only told that activation is successful if the `SignedAuthorization` has been verified locally, device binding has passed, the data has been safely written to disk, and the `LicensingRuntimeService` successfully initialized the new token.

## 7. Activation Failure Semantics
Failures fail closed. If the server is unreachable, the signature is invalid, or the device binding fails, the UI falls back to clear, business-friendly messages mapped in `App.tsx` and `LicensingBanner.tsx`. Cryptographic internals (like "Ed25519 signature mismatch") are omitted from the UI to protect the attack surface.

## 8. Offline Behavior
After successful activation, normal usage requires **no internet access**. Valid offline users see no warnings, periodic heartbeat checks, or grace-period countdowns. The `LicensingRuntimeService` re-evaluates the temporal valid boundaries locally on system resume without triggering network requests.

## 9. Expiration UX
When an authorization hits the `validUntil` boundary:
1. `LicensingRuntimeService` pushes an `EXPIRED` state to the renderer.
2. The renderer mounts `LicensingBanner` over the billing window.
3. The customer **cannot finalize new bills**, as enforced by the `LicensingBillingGate` in the Main process.
4. **Crucially, business data is preserved.** The draft is not destroyed, and `bill_items` remain perfectly intact, preventing catastrophic loss during unexpected mid-transaction expiration.

## 10. Error Mapping
Internal codes correctly map to user messages:
- `AUTHORIZATION_DEVICE_MISMATCH` -> "This authorization was issued for a different device. Please activate Mini POS on this device."
- `SECURE_IDENTITY_UNAVAILABLE` -> "Device identity is unavailable. Please restart the application or contact support."
- `AUTHORIZATION_SIGNATURE_INVALID` -> "The local authorization could not be verified. Please contact support or reactivate your Mini POS license."

## 11. Security Boundary
The renderer is fully untrusted. Even if an attacker manually overrides `useLicensingStore` via React DevTools to set `state = ACTIVE`, the Main-process `LicensingBillingGate` absolutely blocks any calls to `BillingService.finalizeBill()`. The renderer cannot forge state.

## 12. Renderer Trust Model
The renderer is merely a remote controller. It asks Main for the status and presents it. It never calculates expiration. It never attempts to decrypt or verify the `authorization.json`. 

## 13. Credential-Handling Rules
Activation codes are never stored in localStorage, indexedDB, or SQLite. They are never written to disk in plain text. They are sent directly over IPC to the Main process, which consumes them in the one-time HTTP activation request and immediately discards them.

## 14. Artifact Inspection
The production artifact `dist-electron/main.js` was inspected.
- It contains the `AuthorizationVerifier`.
- It dynamically accepts the server's public key (injected via the environment `LICENSING_SERVER_PUBLIC_KEY`).
- **No private signing keys are bundled.**
- **No test bypass variables** exist in the normal release build.

## 15. Automated Tests
Tests were executed confirming:
- The UI handles the full lifecycle.
- State updates propagate properly from Main.
- UI bypasses are effectively blocked by Main `LicensingBillingGate`.
- Undo/Clear actions on the billing store successfully operate alongside the UI.

## 16. Exact Test Counts
```
> mini-erp@1.0.0 test
> vitest run
Test Files  29 passed (29)
Tests  136 passed (136)

> mini-erp@1.0.0 test:e2e
> playwright test
26 passed (32.8s)
```
Total End-to-End and Integration tests fully passing without environmental flakiness.

## 17. Manual QA
- **TEST A (Fresh launch)**: Activating without a token shows `ActivationScreen`.
- **TEST B (Valid activation)**: Submitting a valid test code provisions the token correctly and transitions immediately to the Billing layout.
- **TEST C (Restart)**: Restarting the app after activation gracefully boots directly to Billing.
- **TEST D (Offline restart)**: Restarting the app without an internet connection successfully validates the local `authorization.json` signature and boots to Billing.
- **TEST G (Expired billing)**: Bypassing the token temporal boundaries forces `EXPIRED`, immediately blocking the `FINALIZE & PRINT` action while preserving the existing active draft items.

## 18. Limitations
- Hardware identification failures currently prevent application boot entirely; there is no secondary fallback mechanism if Secure Enclave/TPM fails.

## 19. Deferred Lifecycle Features
The following are out of scope for Phase 9 and strictly deferred:
- License Deactivation
- Automatic Renewals or Subscriptions
- Technical Leases
- Lost-device recovery protocols

## 20. Final Phase 9 Status
**COMPLETE**. The Mini POS licensing UI is safe, offline-capable, aesthetically integrated, fails closed, and strictly relies on the Main process for all authoritative licensing decisions.
