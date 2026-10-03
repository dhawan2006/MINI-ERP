# Runtime Check-In Rollout Plan V1

## Backward Compatibility & Policy Versioning
Old application versions were not designed to enforce the 7-day policy. The rollout relies on a strict `policyVersion`.
- **`policyVersion = 0`**: Legacy behavior (no check-in enforcement, current standard).
- **`policyVersion = 1`**: Mandatory weekly check-in enforced.

Old binaries will continue receiving `policyVersion = 0` (or will not know how to process a V1 check-in). We must not assume old binaries understand the new policy.

## Rollout Strategy
1. **New Client Release**: Release the new Electron client with `policyVersion = 1` support, but initially, the server defaults to serving `policyVersion = 0` or ignores check-in failures.
2. **QA Phase**: Enable `policyVersion = 1` on testing servers.
3. **Hosted QA**: Complete certification testing.
4. **Production Deployment**: V1 introduced in the backend schema and Edge Functions.
5. **Gradual Enforcement**: Opt-in customers to `policyVersion = 1` progressively.
6. **Mandatory Enforcement**: Once the majority of active devices have upgraded their client binaries, the server sets `policyVersion = 1` for all new and renewing licenses.

## Test Strategy (Phase 1+)
- **postgres.js Regression**: Direct transaction tests covering savepoint isolation and rollback scenarios for check-in records.
- **Crypto Integrity**: Unit tests for generating, tampering with, and validating check-in challenges and receipts.
- **State Machine Isolation**: Verify that the renderer cannot mock or fake an active check-in.
- **Clock Manipulation**: Mock the system clock moving forward, backward, and halting to ensure `checkInValidUntil` behaves safely.

## Rate Limiting Strategy
- Apply edge-level rate limiting using Supabase Edge Functions/Redis to restrict endpoints.
- Client endpoints (`/runtime/challenge`, `/runtime/checkin`) are aggressively limited per `deviceKeyId` and IP to prevent request storms (e.g., maximum 5 requests per minute, with a cooldown).
- Admin endpoints require high-tier Auth but are still subject to sane operational limits.
