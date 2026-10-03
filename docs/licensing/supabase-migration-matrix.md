# Mini POS — Supabase Migration Matrix

| CURRENT COMPONENT | CURRENT LOCATION | FUTURE LOCATION | DATABASE DEPENDENCY | CRYPTO DEPENDENCY | SECURITY SENSITIVITY | MIGRATION STATUS | TEST REQUIREMENT |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Activation Route** | `src/routes/activation.ts` | `supabase/functions/activate/index.ts` | No | No | High | Pending | Differential, Concurrency |
| **Lifecycle Route** | `src/routes/lifecycle.ts` | `supabase/functions/deactivate/index.ts` | No | No | High | Pending | Differential |
| **Admin Route** | `src/routes/admin.ts` | `supabase/functions/admin/index.ts` | No | No | High | Pending | Differential |
| **Activation Service** | `src/services/ActivationService.ts` | `supabase/functions/_shared/services/ActivationService.ts` | Yes (licenses, devices, bindings, requests, audit) | Yes (Verifier, Signer) | Critical | Pending | Differential, Concurrency |
| **Deactivation Service** | `src/services/DeactivationService.ts` | `supabase/functions/_shared/services/DeactivationService.ts` | Yes (bindings, devices, requests, audit) | Yes (Verifier) | High | Pending | Differential |
| **License Service** | `src/services/LicenseService.ts` | `supabase/functions/_shared/services/LicenseService.ts` | Yes (licenses, audit) | Yes (HMAC) | High | Pending | Differential |
| **Admin Service** | `src/services/AdminLifecycleService.ts` | `supabase/functions/_shared/services/AdminLifecycleService.ts`| Yes (licenses, bindings, audit)| No | High | Pending | Differential |
| **Audit Service** | `src/services/AuditService.ts` | `supabase/functions/_shared/services/AuditService.ts` | Yes (audit_events) | No | Medium | Pending | E2E |
| **Device Service** | `src/services/DeviceService.ts` | `supabase/functions/_shared/services/DeviceService.ts` | Yes (devices) | No | Low | Pending | E2E |
| **Challenge Service**| `src/crypto/ChallengeService.ts` | `supabase/functions/_shared/crypto/ChallengeService.ts` | Yes (device_challenges) | Yes (UUID, randomBytes) | High | Pending | Cryptographic validation |
| **Server Signer** | `src/crypto/ServerAuthorizationSigner.ts`| `supabase/functions/_shared/crypto/ServerSigner.ts` | No | Yes (Ed25519) | Critical | Pending | Cryptographic validation |
| **Device Verifier** | `src/crypto/DeviceProofVerifier.ts` | `supabase/functions/_shared/crypto/DeviceVerifier.ts` | No | Yes (P-256 ECDSA)| Critical | Pending | Cryptographic validation |
| **License Crypto** | `src/crypto/licenseKey.ts` | `supabase/functions/_shared/crypto/licenseKey.ts` | No | Yes (HMAC, SHA256) | High | Pending | Cryptographic validation |
| **Admin Middleware** | `src/middleware/adminAuth.ts` | `supabase/functions/_shared/middleware/adminAuth.ts` | No | Yes (timingSafeEqual)| High | Pending | Security test |
| **Rate Limiter** | `app.ts` (express-rate-limit) | Supabase API Gateway / Upstash Redis | No | No | Medium | Pending | E2E Security test |
| **App Entrypoint** | `app.ts`, `server.ts` | `supabase/functions/` (Edge function entries) | No | No | Low | Pending | Deployment test |
| **Initial Schema** | `migrations/001_initial_schema.sql` | `supabase/migrations/` | Yes | No | Critical | Pending | DB Apply |
| **Challenges Table** | `migrations/002_challenges_table.sql` | `supabase/migrations/` | Yes | No | Medium | Pending | DB Apply |
| **Lifecycle Schema** | `migrations/003_lifecycle_schema.sql` | `supabase/migrations/` | Yes | No | Medium | Pending | DB Apply |
| **Production Schema**| `migrations/004_production_hardening.sql`| `supabase/migrations/` | Yes | No | High | Pending | DB Apply |
| **Electron Client** | `electron/licensing/LicensingClient.ts` | **NO CHANGE** | No | No | Medium | Completed | None |
| **Electron Runtime** | `electron/licensing/LicensingRuntime...` | **NO CHANGE** | No | No | Critical | Completed | None |
| **Local Auth Store** | `src/infrastructure/licensing/...` | **NO CHANGE** | No | No | Critical | Completed | None |
| **Native Identity** | `electron/native/...` | **NO CHANGE** | No | Yes | Critical | Completed | None |
