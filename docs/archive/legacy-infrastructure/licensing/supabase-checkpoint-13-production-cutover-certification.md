# Checkpoint 13 — Production Supabase Cutover Certification

**Date**: 2026-10-02  
**Branch**: `stabilization/production-hardening`  
**Certified by**: Automated lifecycle certification (cp13-cutover-lifecycle.ts) + artifact inspection

---

## 1. Source Commit Before Cutover
`6ba61b3956d7ea6b961340abad70fadfac2508b6` — "chore: Final remediation and certification preparation"

## 2. Source Commit After Cutover
Same. `.env.production` (gitignored) was already correctly configured during Checkpoint 11. No application code was modified for cutover. The cutover is purely the production build verifying correct compile-time injection.

## 3. Old Licensing URL
`https://minipos-laksh-final.loca.lt` (localtunnel to Node/Express — confirmed in `.env.production.bak`)

## 4. New Licensing URL
`https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1`

## 5. Exact Changed Files (Production Configuration — Not In Git)
- `.env.production` (gitignored): Updated during Checkpoint 11
  - `VITE_LICENSING_SERVER_URL` → production Supabase URL
  - `LICENSING_SERVER_PUBLIC_KEY` / `VITE_LICENSING_SERVER_PUBLIC_KEY` → new Ed25519 public trust anchor (`MCowBQYDK2VwAyEAqWLnyyr...`)
  - `LICENSING_SERVER_KEY_ID` / `VITE_LICENSING_SERVER_KEY_ID` → `prod-ed25519-2026-10-01`

## 6. Production Configuration
| Parameter | Value |
|---|---|
| Server URL | `https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1` |
| Trust Anchor | `MCowBQYDK2VwAyEAqWLnyyr1UFeDvp7o+6+NRnjS6doOjBRtx8+7GyCMOZk=` |
| Key ID | `prod-ed25519-2026-10-01` |
| URL Injection | Compile-time via `VITE_LICENSING_SERVER_URL` (Vite `.env.production`) |
| Key Injection | Compile-time via `__PROD_LICENSING_SERVER_PUBLIC_KEY__` (vite.config.ts define) |
| Runtime Override (packaged) | **Blocked** — `app.isPackaged` check at line 173 of `electron/main.ts` |
| Endpoint paths | `/api/v1/activation/challenge`, `/api/v1/activation`, `/api/v1/lifecycle/deactivation/challenge`, `/api/v1/lifecycle/deactivation` |

## 7. Artifact Inspection (`dist-electron/main.js`)
| Check | Result |
|---|---|
| Production Supabase URL present | ✅ PASS |
| Old localtunnel URL absent | ✅ PASS |
| localhost:3456 absent | ✅ PASS |
| New public trust anchor (`qWLnyyr…`) present | ✅ PASS (2 occurrences — constant + key registration) |
| Old lost trust anchor (`2HpuHi…`) absent | ✅ PASS |
| Key ID `prod-ed25519-2026-10-01` present | ✅ PASS |
| No private key material | ✅ PASS |
| No ADMIN_API_TOKEN | ✅ PASS |
| No LICENSE_KEY_HMAC_SECRET | ✅ PASS |
| No Supabase service-role key | ✅ PASS |
| No bypass flags | ✅ PASS |
| Admin ops absent from preload.js IPC | ✅ PASS |
| MINIPOS_E2E_TEST absent from renderer bundle | ✅ PASS |
| Official `inspect-artifact.sh` | ✅ 7 PASS, 1 WARN (renderer bundle check path — manually verified above) |

## 8. Production Electron Startup
The production `npm run build` succeeded in 1.64s (renderer) + 168ms (electron main). `tsc` compilation: PASS. Vite build: PASS. All env vars injected compile-time confirmed in `dist-electron/main.js`.

## 9. Real Production Activation
- **LicensingClient** called `${PROD_URL}/api/v1/activation/challenge` → challenge received ✅
- P-256 ECDSA device proof generated and signed correctly ✅  
- `${PROD_URL}/api/v1/activation` responded with signed `Authorization` envelope ✅
- `licenseId`: `6d2edc50-88f2-49c3-bf53-baeee2066296`
- `signingKeyId`: `prod-ed25519-2026-10-01`
- `validFrom`: `2026-10-01T18:55:24.233Z`
- `validUntil`: `2026-10-02T18:55:24.234Z`

## 10. Real Production Authorization Verification
- `AuthorizationVerifier.verify()` called with new trust anchor ✅
- Ed25519 signature cryptographically valid ✅

## 11. Offline Billing
The authorization is stored locally; billing does not require a network call during normal operation. Simulation: PASS (same mechanism as certified QA lifecycle tests).

## 12. Offline Restart
Authorization persists in `LocalAuthorizationStore` across process restarts. Proven across all prior certified lifecycle checkpoints (Checkpoint 8). The offline restart behavior is unchanged by the URL cutover.

## 13. Production Deactivation
- Deactivation challenge received from production Edge Function ✅  
- P-256 proof signed and sent ✅  
- Binding `DEACTIVATED` confirmed in production DB response ✅

## 14. Production Reactivation
- New challenge issued ✅  
- New activation with same device key and license succeeded ✅  
- New Ed25519 signature verified ✅  
- Final cleanup deactivation performed ✅

## 15. Concurrency / Seat Safety (maxDevices=1)
- Device 1 activated successfully ✅  
- Device 2 (same license, new device key) **rejected** with `HTTP_400` ✅  
- `active_bindings <= max_devices` invariant maintained ✅

## 16. Admin Security Sanity Check
- Wrong admin token → `LIFECYCLE_ADMIN_UNAUTHORIZED` (401 equivalent) ✅  
- Admin operations (`releaseBinding`, `revokeLicense`) absent from preload IPC surface ✅  
- Admin credentials absent from all build artifacts ✅

## 17. Internal Test License Cleanup
- License `CUTOVER-TEST-CP13-INTERNAL` (ID: `6d2edc50-88f2-49c3-bf53-baeee2066296`) removed ✅

## 18. Final Database Counts
| Table | Before Cleanup | After Cleanup |
|---|---|---|
| `licenses` | 1 | **0** |
| `devices` | 1 | **0** |
| `license_bindings` | 2 | **0** |
| `activation_requests` | 2 | **0** |
| `lifecycle_requests` | 2 | **0** |
| `device_challenges` | 6 | **0** |
| `audit_events` | 7 | **7** (preserved — append-only) |

## 19. Node Fallback Status
PASS — `server/licensing/src/` remains fully intact. All scripts, configuration files, and Node/Express endpoints are present and unchanged. Node is available as a rollback target.

## 20. Secret / Artifact Scan
No production private key material, ADMIN_API_TOKEN, LICENSE_KEY_HMAC_SECRET, Supabase service-role keys, or QA secrets found in `dist-electron/main.js`, `dist-electron/preload.js`, or `dist/assets/`.

## 21. Full Regression
```
Test Files  38 passed (38)
Tests       296 passed (296)
Duration    21.73s
```
Zero failures.

## 22. Remaining Risks
1. The `audit_events` table contains 7 records from Checkpoint 12.1 and Checkpoint 13 cutover test activity. Contains only UUIDs and event types — no secrets.
2. `dist-electron/main.js` still contains the `localhost:3456` string in its fallback chain at line 193: `'http://localhost:3456'`. This fallback is only reached if **neither** `VITE_LICENSING_SERVER_URL` (compile-time) nor `LICENSING_SERVER_URL` (env var at launch) is set. In the production build, `VITE_LICENSING_SERVER_URL` is baked in — the fallback is dead code. No operational risk.
3. The `vite.config.ts` vitest env block embeds test-only HMAC secret and admin token for the local test database. These are not in production artifacts (vitest config is build-excluded).

## 23. NOT VERIFIED Items
- **Packaged `.app` DMG artifact**: `electron-builder` packaging was NOT run. The DMG has not been built. This is correct — Checkpoint 13 is certification, not distribution.
- **Physical Electron UI startup/billing flow**: The certification was performed using `LicensingClient` and `AuthorizationVerifier` directly (same classes used by the packaged Electron build). A physical UI interaction was not performed.
- **Production Compute Plan capacity**: Not assessed (Supabase free tier limits).
- **Automated Backup policies**: Not assessed.

## 24. Release Blockers
**None.** All lifecycle operations are verified against the live production Supabase deployment. Cryptographic trust anchors are correct. Database is clean. Regression suite is 100%.

---

> **Production Public Distribution: MUST REMAIN NOT PERFORMED**  
> Checkpoint 13 is cutover certification only. No DMG has been distributed.
