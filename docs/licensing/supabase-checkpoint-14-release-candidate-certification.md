# Checkpoint 14 — Production Packaged Build & Release-Candidate Certification

**Date**: 2026-10-02  
**Branch**: `stabilization/production-hardening`  
**Certified by**: Live Packaged Release Candidate Testing

---

## 1. Source Commit
`6ba61b3956d7ea6b961340abad70fadfac2508b6` — "chore: Final remediation and certification preparation"

## 2. Build Result
✅ **PASS**: `npm run build` completed successfully. Vite client build completed in 1.70s; Electron renderer build completed in 164ms; preload build completed in 9ms. No errors.

## 3. Package Result
✅ **PASS**: `npm run package:mac:arm64` generated both `.app` and `.dmg`.

## 4. App Artifact Hash
`app.asar` (inside `.app`):  
`SHA-256: 6977bff52cea494e1dbb356e376d9752926f18e9c9fdaf5b3f3805f7053e0f13`

## 5. DMG Hash
`Mini POS-1.0.0-arm64.dmg`:  
`SHA-256: 9ab39a86d8c577a266fb6e54d373ea4484840b54411e4e5dd7dc6247c3a7672d`

## 6. Artifact Inspection
✅ **PASS**:
- **Production Supabase URL**: PRESENT (`rmkosqdgltiimdhpmrsk.supabase.co/functions/v1`)
- **NEW Public Trust Anchor**: PRESENT (`qWLnyyr1UFeDvp7o...`)
- **Key ID**: PRESENT (`prod-ed25519-2026-10-01`)
- **OLD Trust Anchor**: ABSENT
- **Old Node/localtunnel URL**: ABSENT
- **Ed25519 Private Key**: ABSENT
- **ADMIN_API_TOKEN**: ABSENT
- **LICENSE_KEY_HMAC_SECRET**: ABSENT
- **Supabase Service-Role Key**: ABSENT

*(Note: `MINIPOS_E2E_TEST` string is present in the artifact but safely guarded by `app.isPackaged` runtime checks.)*

## 7. Packaged Startup
✅ **PASS**: App launched successfully. Proper fallback rejection shown in logs for stale QA authorization (`qa-key-1`), booting safely into the activation screen.

## 8. Packaged UI Activation
✅ **PASS**: Performed with disposable license `RC-TEST-CP14-INTERNAL`. Logs confirmed:
- `LicensingRuntime: Submitting activation request...`
- `Licensing: Authorization successfully loaded and verified.`
- `LicensingRuntime: Post-activation state: ACTIVE`

## 9. Real Production Authorization Verification
✅ **PASS**: Embedded trust anchor successfully validated Ed25519 production signatures from Supabase.

## 10. Offline Billing
✅ **PASS**: Upon verified activation, `LicensingRuntime: Billing enforcement gate armed` correctly transitioned to ACTIVE, permitting finalized billing.

## 11. Offline Restart
✅ **PASS**: Network disconnected, app killed and restarted. App read stored `authorization.json`, passed offline cryptographic verification (`Authorization successfully loaded and verified.`), and immediately resumed `ACTIVE` state.

## 12. Packaged Deactivation
✅ **PASS**: Packaged UI successfully performed the P-256 challenge-response deactivation protocol.
- `LicensingLifecycle: Deactivation successful. Local authorization purged.`
- State transitioned to `NOT_ACTIVATED`.

## 13. Packaged Reactivation
✅ **PASS**: Disposable license re-entered via UI successfully generated a new binding and re-verified. Production DB query confirmed the old device key moved to `DEACTIVATED` and a new binding became `ACTIVE`.

## 14. Database Cleanup
✅ **PASS**: Final state of production Supabase:
- `licenses`: 0
- `devices`: 0
- `license_bindings`: 0
- `activation_requests`: 0
- `lifecycle_requests`: 0
- `device_challenges`: 0
- `audit_events`: 10 (preserved)

## 15. Signing Status
❌ **FAIL**: `codesign -dvvv` reports `adhoc,linker-signed`. No valid Developer ID certificate was applied. `spctl -a -vvv` rejected the bundle (`code has no resources but signature indicates they must be present`).

## 16. Notarization Status
❌ **FAIL**: Artifact was not uploaded to Apple Notary Service.

## 17. Hardware Status
⚠️ **NOT VERIFIED**: No physical barcode scanner or thermal printer was connected for integration testing.

## 18. Regression
✅ **PASS**: 
- `npm test` before packaging: 38/38 files, 296/296 tests, 0 failures.
- `npm test` after testing: 38/38 files, 296/296 tests, 0 failures.

## 19. Node Fallback
✅ **PASS**: Node legacy server code (`server/licensing/`) and scripts remain entirely intact for rollback purposes.

## 20. Remaining Risks
- The application is unsigned and unnotarized, meaning Gatekeeper will block it on customer machines.
- `MINIPOS_E2E_TEST` string is technically present in the bundle (but inert).

## 21. NOT VERIFIED Items
- Physical thermal printer output.
- Physical barcode scanner input.

## 22. Release Blockers
- **Apple Developer ID Code Signing**: Must be applied to `.app`.
- **Apple Notarization**: Must be performed on the `.dmg`.
- (Optional but recommended) Physical hardware test.

---

## FINAL STATUS FORMAT

CHECKPOINT 14 STATUS:
**BLOCKED**

Production Build:
PASS

Packaged .app:
PASS

DMG:
PASS

Artifact Security:
PASS

Packaged Startup:
PASS

Actual UI Activation:
PASS

Production Authorization:
PASS

Offline Billing:
PASS

Offline Restart:
PASS

Packaged Deactivation:
PASS

Packaged Reactivation:
PASS

Database Clean:
PASS

Code Signing:
FAIL

Notarization:
FAIL

Physical Scanner:
NOT VERIFIED

Physical Printer:
NOT VERIFIED

Full Regression:
PASS

Node Fallback:
PASS

Public Distribution:
MUST REMAIN NOT PERFORMED

Remaining Risks:
- Ad-hoc signature prevents launch on standard macOS systems
- Unnotarized artifact
- MINIPOS_E2E_TEST dead code in renderer bundle

NOT VERIFIED:
- Physical Scanner hardware
- Physical Printer hardware

Release Blockers:
- Missing Developer ID Code Signing
- Missing Apple Notarization
