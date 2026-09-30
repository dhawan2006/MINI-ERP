# Mini POS Licensing Threat Model (v1)

## 1. Security Objectives
The licensing system must protect the commercial value of the Mini POS software without degrading the experience of legitimate, offline users.

- **SO-01**: Only legitimately activated devices may use licensed billing functionality.
- **SO-02**: A customer cannot extend license validity (e.g., expiry dates) by editing local authorization data or modifying system clocks.
- **SO-03**: A copied authorization file cannot be transferred to or used on another device.
- **SO-04**: Concurrent activation requests cannot violate the maximum allowed device limits for a license.
- **SO-05**: Replay of an old activation challenge or response cannot create a new activation or circumvent device proofs.
- **SO-06**: The renderer (React UI) cannot access or extract private device-key material.
- **SO-07**: Billing remains fully offline after successful activation; network availability never gates billing.
- **SO-08**: Licensing failures (corruption, expiry, mismatch) cannot corrupt or delete POS business data (bills, history, products).
- **SO-09**: The server is the absolute authority for commercial license state and authorization issuance.
- **SO-10**: Deactivation must explicitly release the server-side binding so the license slot can be reused.

## 2. Trust Boundaries
The system is divided into explicit trust zones. Transitions across boundaries require strict validation.

- **ZONE A (User / UI / React renderer)**: Untrusted. Can initiate activation requests and display state, but cannot make authoritative billing authorization decisions or access private keys.
- **ZONE B (Electron preload)**: Context-isolated bridge. Only exposes specific, typed IPC channels (e.g., `activateLicense(key)`, `getLicensingState()`). Drops invalid payloads.
- **ZONE C (Electron Main)**: Trusted for orchestration, but untrusted by the Server. It routes HTTP requests, canonicalizes and verifies Server signatures, and enforces the `isBillingAuthorized` boolean.
- **ZONE D (Licensing service inside Main)**: High-trust module within Main handling cryptographic verification and local storage of the `authorization.json`.
- **ZONE E (Native device identity service)**: Highest local trust. Generates and manages the Ed25519 Device Key Pair. Signs byte payloads. Never exports the private key.
- **ZONE F (OS secure key storage)**: External trusted dependency (macOS Keychain / Windows Credential Manager). Protects the Device Private Key at rest.
- **ZONE G (Local authorization storage)**: Untrusted at rest. The `authorization.json` file on disk can be modified by the user. Must be cryptographically verified upon every load.
- **ZONE H (SQLite business data)**: Trusted for POS operations, but strictly separated from licensing. Never contains licensing secrets.
- **ZONE I (Licensing server)**: Absolute authority. Validates challenges, enforces device limits, and issues signed authorizations.
- **ZONE J (Licensing server database)**: Absolute source of truth for license limits, bindings, and status. Enforces uniqueness constraints.
- **ZONE K (Server signing key storage)**: Highest system trust. Holds the Private Signing Key.

## 3. Trusted Computing Base (TCB)
**Must Be Trusted for Licensing Decisions:**
- Server Signing Key (and its secure storage/KMS).
- Licensing Server API Logic.
- Server Database (ACID compliance & constraints).
- Native Device Identity Service & OS Keychain (to secure the device proof).
- Electron Main Process (to honestly verify signatures and apply enforcement).

**Must NEVER Be Trusted:**
- Renderer UI state (`isBillingAuthorized` boolean in Zustand is a reflection, not the authority).
- User-entered input (license keys must be sanitized).
- Local `authorization.json` (must always be verified before trust).
- Local system timestamps (must be checked against rollback heuristics).
- Unverified network responses (must check the Ed25519 signature before accepting).

## 4. Threat Actors
- **TA-01: Normal customer**: Honest user, might make typos.
- **TA-02: Customer with unreliable internet**: Needs the system to function perfectly offline after initial activation.
- **TA-03: Person copying authorization files**: Attempts to bypass paying by copying `authorization.json` to a friend's PC.
- **TA-04: Person copying application data**: Attempts to clone the entire SQLite DB and settings.
- **TA-05: Person replaying network traffic**: Captures HTTP traffic and resends it to bypass limits or fake activations.
- **TA-06: Person modifying local files**: Edits `validUntil` in `authorization.json` to bypass expiry.
- **TA-07: Person manipulating system time**: Rolls back the OS clock to evade `validUntil`.
- **TA-08: Malicious renderer / Injected JS**: XSS payload attempting to extract device keys or fake licensing state.
- **TA-09: Network attacker (MitM)**: Attempts to intercept or modify activation traffic.
- **TA-10: Person controlling the local machine (Root/Admin)**: Has full debug capability, can read RAM, patch binaries, or replace Native modules.
- **TA-11: Compromised server**: Attacker gains access to the activation API logic.
- **TA-12: Compromised signing key**: Attacker extracts the Server's Private Signing Key.

## 5. Threat Catalog

| ID | Threat | Attacker Capability | Impact | Likelihood | Defense | Residual Risk |
|---|---|---|---|---|---|---|
| T-01 | Key brute-forcing | Network scripting (TA-09) | Discover valid license keys | Low | Server-side IP rate limiting | Distributed botnets |
| T-02 | Auth file modification | Local file access (TA-06) | Extend expiry / change constraints | High | Ed25519 signature verification | None (Fails closed) |
| T-03 | Clone to new PC | Copying files (TA-03) | Unpaid usage on second device | High | Device Key binding (OS Keychain) | None (Fails closed) |
| T-04 | Clock rollback | Change OS time (TA-07) | Evade expiry | High | `lastKnownTrustedTime` tracking | Minor window if app never ran |
| T-05 | Binary patching | Root / Debugger (TA-10) | Bypass `isBillingAuthorized` | Low | Code signing / Obfuscation | High (Local machine ownership defeats client logic) |
| T-06 | Challenge Replay | MitM (TA-05) | Bypass device proof | Medium| Single-use server challenges | None |
| T-07 | Activation Race | Scripting (TA-05) | Exceed device limits | Low | DB Transaction / Row locks | None |
| T-08 | Renderer XSS | JS injection (TA-08) | Steal device key | Low | IPC Isolation / Native module boundary | None |

## 6. License Key Attacks
- **Attacks**: Guessing, brute force, enumeration.
- **Defense**: License keys must have high entropy (e.g., 20+ alphanumeric characters). The server must strictly rate-limit the `/api/v1/activation/challenge` and `/api/v1/activation` endpoints per IP and per License Key.
- **Protection**: The server database should ideally store an irreversibly hashed version of the license key if the raw key is not strictly needed for administrative search, though standard practice often encrypts them. The client never stores the raw license key after activation; it relies on the `Authorization` object.

## 7. Authorization Tampering
- **Attacks**: Changing `validUntil` to 2099, modifying `maxDevices`, tampering with `productId`.
- **Defense**: Any modification alters the canonical JSON payload, instantly breaking the Ed25519 signature verification.
- **Other risks**:
  - *Malformed JSON*: Caught during `JSON.parse`.
  - *Duplicate fields*: Canonicalization must use a strict parser that rejects or normalizes duplicates.
  - *Type confusion*: The verification schema must enforce strict types (e.g., `validUntil` MUST be a string, not an integer).

## 8. Signature Security
- **Algorithm**: Ed25519.
- **Canonical Payload**: Sort keys alphabetically, remove all whitespace, UTF-8 encode. Exclude `signature` key.
- **Key ID**: `signingKeyId` embedded in payload.
- **Defense against Algorithm Confusion**: The client hardcodes the verification algorithm (Ed25519). It does NOT accept algorithmic agility (e.g., no falling back to `HS256` or `none`).
- **Unknown Key**: Reject immediately.
- **Modified Payload / Replay**: A valid old authorization cannot be modified. Replaying a valid old authorization is safe because it is bound to the specific `deviceKeyId` and has a strict `validUntil`.

## 9. Device Key Security
- **Extraction**: The Device Private Key lives in the OS Native Keychain. It cannot be extracted by standard filesystem operations.
- **Copying/Cloning**: A copied HDD booted on new hardware generally resets or blocks access to the TPM/Keychain, invalidating the identity.
- **Key Regeneration/Reinstall**: If the OS identity is lost, the machine generates a new key. The server sees this as a New Device, enforcing standard device limits.
- **Fallback**: There is NO insecure file-based fallback in production. If the OS Keychain is broken, activation fails securely.

## 10. Challenge/Response Security
- **Properties**: 32-byte high-entropy random sequence generated by the Server.
- **Expiration**: Cached server-side for maximum 5 minutes.
- **Single-Use**: Once verified during `/api/v1/activation`, the challenge is deleted/marked consumed.
- **Replay/Reuse**: Impossible due to single-use consumption.
- **Mismatch**: The server verifies the signature strictly against the `publicKey` provided in the request, and hashes the `publicKey` to ensure it matches the bound `deviceKeyId`.

## 11. Replay Attacks
- **Request Idempotency**: Handled by `activationRequestId`. If the client resends the exact same POST request due to a network timeout, the server safely returns the previous `Authorization` without modifying DB state. This protects the *user* from losing slots during network drops.
- **Cryptographic Replay Protection**: Handled by the Challenge. An attacker cannot replay a *captured* request to bind a *different* device, because the signature over the challenge would be invalid, and the challenge is single-use.

## 12. Activation Race Conditions
- **Threat**: Attacker sends two requests simultaneously to activate Device A and Device B on a 1-seat license.
- **Defense**:
  - The `license_bindings` table must enforce a check constraint (e.g., trigger or transaction serializability) ensuring `COUNT(device_id) <= max_devices`.
  - The server must process the activation within a `SERIALIZABLE` or `REPEATABLE READ` SQL transaction.
  - Deactivate + Activate concurrently are similarly protected by row-level locking (`SELECT ... FOR UPDATE` on the license row).

## 13. Server Compromise
- **API/Database Compromise**: Attacker can issue valid licenses or revoke them. Mitigated by standard cloud security practices.
- **Signing Key Compromise**: CATASTROPHIC. Attacker can forge authorizations for any device, bypassing all activation limits.
- **Revocation**: The server immediately rotates to a new `signingKeyId`. Client updates will remove the compromised key. However, fully offline clients cannot receive the update.
- **Offline Reality**: Under Option A, an offline machine cannot be forced to reject an authorization signed by a key it still trusts. This is the accepted residual risk of a true offline-first architecture.

## 14. Local Machine Compromise
- **LEVEL 1 (Normal file access)**: Protected. Cannot copy license to another PC (Device ID mismatch). Cannot edit `authorization.json` (Signature breaks).
- **LEVEL 2 (Admin/Root)**: Can delete the authorization, forcing a denial of service (re-activation required).
- **LEVEL 3 (Debug/Patch)**: **VULNERABLE**. An attacker with debugger access can patch the Electron binary to return `true` for `isBillingAuthorized()`.
- **LEVEL 4 (Full local control)**: Same as above. Client-side security is ultimately enforced by the client binary, which is untrusted by definition in a zero-trust model. We protect against casual piracy, not dedicated reverse-engineering.

## 15. Electron Security
- **Context Isolation**: Must be ENABLED.
- **Node Integration**: Must be DISABLED in the renderer.
- **Preload**: Exposes only `window.electron.licensing.activate(key)` and `getAuthStatus()`.
- **Main Process**: Holds the actual verification logic. It never sends the raw verification algorithm or server public key to the renderer.

## 16. Native Helper Security
- **Boundary**: Node-API (N-API) module interfacing with macOS Keychain / Windows Credential API.
- **Allowed**: `initDevice()`, `getPublicKey()`, `sign(challengeBytes)`.
- **Forbidden**: `getPrivateKey()`, file I/O, execution.
- **Authentication**: The native module must be statically linked or securely loaded and code-signed to prevent replacement by a malicious `.node` file.

## 17. Secure Storage
- **DEVICE PRIVATE KEY**: OS Secure Key Storage (Keychain).
- **SERVER PUBLIC VERIFICATION KEY**: Hardcoded in Electron Main source code (obfuscated/compiled).
- **SIGNED AUTHORIZATION**: `authorization.json` in `userData` (Ordinary storage).
- **LICENSE METADATA**: Embedded in `authorization.json`.
- **SQLite**: POS business data ONLY.

## 18. Clock Attacks
- **Threat**: Changing the clock backwards to evade `validUntil`.
- **Defense**: `lastKnownTrustedTime` stored in a hidden local file.
  - Updates on app launch, bill finalization, or server sync.
  - If `Date.now() < lastKnownTrustedTime`, state instantly becomes `INVALID_AUTHORIZATION`.
- **Limitations**: If the user rolls the clock back before the very first launch, the local baseline is skewed. However, `validUntil` is absolute UTC, so they cannot extend the total delta of time granted.

## 19. Offline Security Model
Because Option A requires zero network dependency for billing:
- There is NO heartbeat.
- There is NO technical lease.
- **Residual Risk**: A revoked license remains perfectly valid on a disconnected machine until its natural `validUntil` expiration date. This is an explicit, accepted business tradeoff for high reliability.

## 20. Local File Attacks
- **Deleting authorization**: Reverts to `NOT_ACTIVATED`.
- **Editing authorization**: Signature verification fails -> `INVALID_AUTHORIZATION`.
- **Corrupting authorization**: JSON parsing fails -> `NOT_ACTIVATED`.
- **Copying entire data directory**: Causes `DEVICE_MISMATCH` on the new machine.
- **Impact on POS Data**: ZERO. Licensing errors block UI interactions but do not drop tables or delete files.

## 21. Backup / Restore Attacks
- **Rule**: `authorization.json` and Native Device Keys are explicitly EXCLUDED from SQLite backups.
- **Protection**: Restoring a database onto a new machine brings the business data, but leaves the machine `NOT_ACTIVATED`. The user must legally consume a license slot to activate the new machine and access the restored data.

## 22. Network Security
- **Transport**: Strictly HTTPS (TLS 1.2+).
- **Authentication**: Server certificate validation enforced by Node.js/Electron.
- **Protection**: Mitigates MitM. Activation traffic is never sent in plaintext.
- **Timeouts**: Aggressive timeouts (e.g., 10s) so the UI doesn't hang. Network failures fall back safely.

## 23. API Abuse
- **Endpoint**: `/api/v1/activation/challenge` -> Rate-limit by IP (e.g., 20/min).
- **Endpoint**: `/api/v1/activation` -> Rate-limit by IP and by `licenseKey` (e.g., 5 attempts/hour for failures).
- **Idempotency**: Repeated successful requests with the same `activationRequestId` bypass rate limits to ensure reliable delivery of the Authorization.

## 24. Secret Management
- **SERVER SIGNING PRIVATE KEY**: KMS or strictly controlled environment variable on the server.
- **DATABASE CREDENTIALS**: Server environment variables.
- **DEVICE PRIVATE KEY**: End-user OS Keychain.
**NO SECRETS** are committed to Git or hardcoded in the Electron client. Only the Server's PUBLIC verification key is in the client source.

## 25. Key Rotation
- **Schema**: `signingKeyId` dictates which public key the client uses to verify.
- **Rollout**: A new client version ships with `[prod-key-1, prod-key-2]`. The server begins signing with `prod-key-2`.
- **Compatibility**: Existing authorizations signed by `prod-key-1` remain valid because the client still trusts it.
- **Retirement**: Once all `prod-key-1` authorizations expire naturally, `prod-key-1` is removed from future client binaries.

## 26. Authorization Lifecycle Attacks
- `NOT_ACTIVATED` -> `ACTIVE`: Blocked without a valid server signature.
- `ACTIVE` -> `EXPIRED`: Time-based. Cannot be reversed locally.
- `ACTIVE` -> `DEACTIVATED`: Network required. Attacker dropping network packets during deactivation prevents slot release, which hurts the user, but doesn't bypass security.

## 27. Billing Security
**Architecture**:
`Renderer -> IPC -> Main -> AuthorizationService -> BillingService -> SQLite`
- The `AuthorizationService` inside the Main process evaluates the signature and time.
- It exposes `isBillingAuthorized()`.
- The `BillingService` (Main) checks `isBillingAuthorized()` before executing SQL `INSERT` for a new bill.
- The Renderer is strictly a view layer. Changing React state `isBillingAuthorized = true` in DevTools will only visually unlock the UI; the Main process IPC handlers will reject the actual save operation.

## 28. Security Error Handling
- Invalid license -> "The license key provided is invalid."
- Expired license -> "Your license has expired. Please renew."
- Signature / Tamper -> "Authorization is invalid or corrupted."
- Device Mismatch -> "This license is bound to another device."
- Challenge Replay -> "Activation failed due to a security violation (Code: REPLAY)."
**Rule**: Never leak cryptographic stack traces, expected signature bytes, or database errors to the client UI.

## 29. Security Logging
**Safe to log**:
- Request IDs, License IDs, Device Key IDs, Timestamps, Operation results.
**NEVER log**:
- Ed25519 Private Keys.
- Full Authorization signatures (unnecessary).
- Raw License Keys in client-side trace logs.

## 30. Security Invariants
- **SEC-001**: Only server-signed authorizations are accepted by the client.
- **SEC-002**: Changing signed authorization data permanently invalidates verification.
- **SEC-003**: Private device keys never cross from the OS Keychain into the Electron Renderer or Main process JS memory space.
- **SEC-004**: A device proves possession exclusively through asymmetric challenge-response.
- **SEC-005**: Server challenges are single-use and strictly bound to the requesting public key.
- **SEC-006**: Concurrent activation attempts on the server cannot exceed `max_devices`.
- **SEC-007**: Same idempotency request ID yields the same authorization without side-effects.
- **SEC-008**: Billing remains fully operational offline after successful activation.
- **SEC-009**: An expired authorization strictly blocks new bill finalization.
- **SEC-010**: Local expiry cannot be extended through system clock rollbacks or file editing.
- **SEC-011**: Licensing validation failures never delete or corrupt POS business data.
- **SEC-012**: Renderer state is never the authoritative licensing decision maker.

## 31. Security Test Matrix

| Threat | Test Scenario | Expected Result |
|---|---|---|
| Modified `validUntil` | Edit `authorization.json` to extend date by 1 year. | `AUTHORIZATION_INVALID` (Signature fails) |
| Device Cloning | Copy `authorization.json` to a machine with a different Device Key. | `DEVICE_MISMATCH` |
| Simultaneous Activation | Send 10 concurrent requests for a 1-seat license. | 1 Success, 9 `DEVICE_LIMIT_REACHED` |
| Replay Activation | Resend a captured `/api/v1/activation` payload. | Reject (Challenge already consumed) |
| Idempotency Retry | Resend the exact same request including `activationRequestId`. | Success (Identical Authorization returned) |
| Clock Rollback | Set OS clock back 2 years after finalizing a bill. | `CLOCK_ROLLBACK_DETECTED` / Invalid state |
| Server Outage | Disconnect internet and attempt to process a bill. | Success (Offline autonomy) |
| Renderer Tampering | Override `isBillingAuthorized` in React DevTools and click Finalize. | Main Process rejects IPC action. |

## 32. Security Acceptance Criteria
- Unsigned or malformed authorization objects are safely rejected.
- Modified authorization objects are safely rejected.
- Authorizations signed by unknown/untrusted key IDs are rejected.
- Authorizations with mismatched `deviceKeyId` are rejected.
- Replayed server challenges are rejected.
- Database locks contain race conditions during activation.
- Billing workflows operate correctly without an internet connection.
- Private device key bytes are mathematically proven to remain unexposed to IPC.
- Server outage does not degrade the offline user experience.
- Deactivation securely releases the server binding.

## 33. Residual Risks
1. **Full Local Machine Compromise (Level 3/4)**
   - *Why it remains*: Client-side verification is executed on hardware controlled by the user. An attacker with a debugger can patch the assembly/JS to bypass verification.
   - *Mitigation*: Code obfuscation and code-signing raise the skill floor required.
   - *Severity*: Medium (Typical for all desktop software; we protect against casual piracy, not dedicated reverse-engineering).
2. **Offline Revocation Delay**
   - *Why it remains*: Option A guarantees offline billing. A revoked license will continue working locally until its `validUntil` expiry.
   - *Mitigation*: Issue shorter license durations if rapid revocation is a business requirement (e.g., 1-year terms instead of lifetime).
   - *Severity*: Low (Accepted business tradeoff).
3. **OS Secure Storage Limitations**
   - *Why it remains*: Users lacking a functional OS Keychain (e.g., broken Windows Credential Manager) cannot generate a device identity.
   - *Mitigation*: Graceful error messages instructing OS repair. No insecure fallbacks.
   - *Severity*: Low.

## 34. Security Priorities
- **CRITICAL**: Cryptographic signature validation in Main process.
- **CRITICAL**: Server-side transaction locks enforcing `max_devices`.
- **CRITICAL**: Challenge-response mechanism preventing replays.
- **HIGH**: Device key binding via OS Keychain.
- **HIGH**: Context-isolated IPC ensuring Main process owns the billing authorization logic.
- **MEDIUM**: Clock rollback heuristics.
- **LOW**: Client-side code obfuscation.

## 35. Implementation Order
1. **Cryptographic contract**: Define the exact canonical JSON schema and Ed25519 wrappers.
2. **Server data model**: Implement schemas and constraints (`max_devices`).
3. **Server authorization transaction**: Implement the idempotent activation API and challenge cache.
4. **Native device identity**: Implement the Node-API helper for OS Keychain.
5. **Local authorization verification**: Implement the file loader and signature verifier in Main.
6. **Electron IPC boundary**: Establish the secure messaging interface.
7. **Billing integration**: Apply the `isBillingAuthorized` guard to the SQLite database writers.
8. **Activation protocol (UI)**: Build the React screens and wire to IPC.
9. **Deactivation/transfer**: Implement the release mechanisms.
10. **Production signing**: Configure build pipelines.
11. **Adversarial testing**: Execute the Security Test Matrix.

## 36. Final Consistency Check
- Checked against `docs/licensing-specification-v1.md`.
- **Contradictions found**: NONE. The threat model strictly adheres to the offline-first, Ed25519-signed, device-bound Option A model. No periodic heartbeats were introduced, and graceful failures were maintained.

---

### FINAL REPORT SUMMARY
1. **Threat model completed**: `docs/licensing-threat-model-v1.md` created.
2. **Trust boundaries**: Explicitly defined across Renderer, Main, Native, and Server.
3. **Threat actors**: Cataloged from normal offline users to root-level attackers.
4. **Main threats**: Covered replay, tampering, clock manipulation, and cloning.
5. **Security controls**: Ed25519 signatures, OS Keychain, DB transactions, single-use challenges.
6. **Security invariants**: Listed definitively (SEC-001 through SEC-012).
7. **Test matrix**: Provided explicit test scenarios for verification.
8. **Residual risks**: Acknowledged patching and offline revocation delays as accepted tradeoffs.
9. **Critical implementation requirements**: Cryptographic verification and DB locks highlighted.
10. **Phase 0 contradictions**: Zero contradictions found.

**NO APPLICATION CODE WAS MODIFIED IN PHASE 1.**
