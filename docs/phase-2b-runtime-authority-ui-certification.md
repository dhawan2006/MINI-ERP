# Phase 2B: Runtime Check-In Authority Integration + User Experience Certification

## Objective
Integrate the Runtime Check-In components (`RuntimeCheckInCoordinator`, `LocalRuntimeStateStore`) into the existing `LicensingRuntimeService` and provide the associated user-facing UI for weekly verification.

## Implemented Features

### 1. Authority Integration (Main Process)
- Integrated `RuntimeCheckInCoordinator` into `LicensingRuntimeService`.
- Added synchronous and asynchronous evaluation of check-in state (e.g., `CHECKIN_OVERDUE`, `DUE_SOON`, `REQUIRED`).
- Updated `LicensingStatusDTO` to include check-in specific fields (`checkInState`, `checkInValidUntil`, `policyVersion`, `pendingDirectivesCount`).
- `LicensingBillingGate` remains secure and uses the unified Main-process runtime state.

### 2. Automatic Background Check-in
- **Startup:** Added a non-blocking trigger for check-in upon app initialization.
- **Resume:** Added a trigger for check-in on system resume (`powerMonitor.on('resume')`).
- These background checks automatically repair `CHECKIN_OVERDUE` states when internet connectivity is restored.

### 3. User Experience (Renderer)
- **LicensingBanner:** Added warning banners for `REQUIRED` (within 6h) and `DUE_SOON` (within 48h) check-in thresholds.
- **Verify Now:** Added a "Verify Now" button to the banner to allow manual check-ins.
- **License Blocked Screen:** Modified `ActivationScreen` to act as a generic fallback that handles terminal/blocked states (`CHECKIN_OVERDUE`, `REVOKED`, `DISABLED`, `DEVICE_MISMATCH`, `EXPIRED`). It prevents users from being forced to re-enter their license key unnecessarily and displays an appropriate "Verify Now" button for overdue check-ins.

### 4. IPC Handlers
- Implemented `license:verifyNow` allowing the renderer to explicitly request a check-in.
- Hardened IPC: renderer can only initiate verifyNow or read state (`license:getState`), preserving strict Main-process authority (SEC-RT-002).

## Next Steps
- Implement specific directive processing (e.g., custom admin messages, silent config updates).
- Roll out policies to the QA test fleet for integration testing and edge-case verification.
