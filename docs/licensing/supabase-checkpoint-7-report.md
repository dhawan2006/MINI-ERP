# Checkpoint 7 Report — Deactivation Lifecycle

## 1. Node Reference Behavior & Parity
The Supabase Edge Function `deactivate` correctly mirrors the Node Reference `DeactivationService.ts` and `/api/v1/lifecycle/deactivation` routes:
- Generates a cryptographically strong challenge with the exact `DEACTIVATION` purpose tag.
- Validates the device's cryptographic proof over the challenge.
- Secures the request idempotency using `lifecycle_requests`.
- Acquires an exclusive `FOR UPDATE` lock on the active `license_bindings` record.
- Ensures the active `license_bindings` row belongs to the target `deviceKeyId`.
- Safely updates the status to `DEACTIVATED` and audits the event as `DEACTIVATION_COMPLETED`.
- Atomically consumes the deactivation challenge exactly once.

## 2. Seat Release and Deactivation Constraints
- When a device correctly requests a deactivation and provides a valid proof, the binding status is mutated to `DEACTIVATED`. This formally releases the seat, fulfilling the `active_bindings < max_devices` invariant for future requests.
- The `DEACTIVATION` challenge cannot be consumed twice (preventing replay attacks), and `ACTIVATION` challenges cannot be repurposed due to strict purpose-binding during signature canonicalization.
- The system correctly denies deactivation if a device does not own the active binding (`BINDING_NOT_FOUND`).

## 3. Concurrency, Race, and Idempotency Results
To enforce the exact same isolation as Node, the logic uses `postgres.js` and strict query boundaries within `sql.begin()`.
We created a comprehensive differential concurrency suite in `deactivation-differential.deno.ts` to test identical load on Local and Hosted QA against the Node equivalent:
- **Valid Deactivation**: Successfully transitioned binding to `DEACTIVATED` and issued correct response schema on all targets.
- **Idempotency (Same Payload)**: Successfully returned identical cached response on all targets.
- **Conflict (Different Payload)**: Prevented secondary divergent request execution, throwing `409 LIFECYCLE_REQUEST_CONFLICT`.
- **Already Deactivated**: Prevented repeated deactivation of the same binding (`ALREADY_DEACTIVATED`).
- **No Binding Found**: Correctly denied operation if no matching device binding was `ACTIVE`.

## 4. Rollback and Error Semantics
By throwing expected `DeactivationError` subclasses within the `try-catch`, the PostgreSQL transaction correctly rolls back (just like the Node `transaction()` helper):
- A business validation failure after challenge consumption (such as `BINDING_NOT_FOUND`) correctly rolls back the challenge's `status = CONSUMED` state.
- Idempotency violations and cryptographic signature mismatches result in `400` or `409` HTTP responses with standardized error codes identical to Node.

## 5. Client Compatibility
A pure integration test (`tests/supabase/client-compatibility/deactivation-client.test.ts`) validated the unmodified `LicensingClient.ts` and `LicensingLifecycleService.ts` from the existing Electron application.
The existing Electron UI components seamlessly executed the activation followed by a deactivation utilizing the Supabase Edge infrastructure (proxied strictly over HTTP). The client recognized the exact success schemas and securely expunged its local authorization cache.

## 6. Secret Audit
No hardcoded credentials, production flags, or debug keys exist in the `deactivate` Edge Function. The system strictly leverages transaction bindings (`postgres.js`) and environmentally provided credentials.

---
**CHECKPOINT 7: PASS**
The complete Deactivation Lifecycle has been successfully implemented, differentially tested against Node, hosted on Supabase QA, and fully verified for compatibility with the native Electron application.
