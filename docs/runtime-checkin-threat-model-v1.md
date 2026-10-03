# Runtime Check-In Threat Model V1

## Threat Model
- **Attacker intercepts check-in**: Network requests use TLS, and responses are signed by the server's Ed25519 key. Integrity is assured.
- **Replay attack**: Overcome via single-use challenges bound to the `deviceKeyId` and a specific purpose.
- **Clock manipulation**: The client relies on the server's signed `serverTime` and `checkInValidUntil`. If the local clock is rolled back, the `checkInValidUntil` remains absolute. `checkInValidUntil` cannot exceed `licenseValidUntil`.
- **Malicious/offline device**: If the device stays offline, the check-in expires automatically after 7 days, denying billing.
- **State modification**: The state is kept in the Main process and saved atomically. Renderer cannot arbitrarily set the license state.

## Security Invariants
- `SEC-RT-001`: Main process is the sole licensing authority.
- `SEC-RT-002`: Renderer cannot set or override licensing state.
- `SEC-RT-003`: IPC failure never defaults to ACTIVE.
- `SEC-RT-004`: Valid local authorization remains valid offline until its check-in expires.
- `SEC-RT-005`: Network availability does not fabricate valid authorization.
- `SEC-RT-006`: Expiry is strict; `currentTime >= validUntil` or `currentTime >= checkInValidUntil`.
- `SEC-RT-007`: The check-in policy must explicitly respect the existing `licenseValidUntil`.
- `SEC-RT-008`: Signed check-in bytes are canonicalized using RFC 8785.
- `SEC-RT-009`: Private keys never leave their secure boundaries.

## Failure Modes
- **Internet unavailable / DNS failure / Timeout**: Client retries with exponential backoff. Retains current validity until `checkInValidUntil` is reached.
- **Supabase unavailable (HTTP 500)**: Treated as offline. Retry later.
- **HTTP 429 (Rate Limited)**: Wait and retry.
- **Malformed JSON / Schema mismatch / Invalid signature**: Fail closed. Discard response, do not update `checkInValidUntil`.
- **Duplicate Request**: Handled by idempotent `checkInRequestId`. Server returns identical receipt.
- **Clock Rollback**: The application uses monotonic checks where possible. The absolute timestamp `checkInValidUntil` ensures setting the clock back does not bypass expiry.
- **Local State Corruption**: Main process fails closed, rejecting billing if the check-in state is corrupted.
