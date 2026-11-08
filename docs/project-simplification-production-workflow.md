# Mini POS: Simplification and Production Workflow

**Assessment date:** 2026-10-30  
**Scope:** repository review and proposed workflow only. No code changes, tests, hosted requests, or deployments were performed for this assessment.

## 1. Executive summary

The product is an offline-first point-of-sale desktop application with a separate web administration panel and a remote licensing service. The checkout already contains substantial business logic, security controls, and test material. The main problem is that the product and its delivery process have accumulated too many parallel paths and overlapping documents. This makes it hard to know which implementation is authoritative, whether a reported pass applies to the current code, and why a license request failed.

The highest priority is to make license creation safe and observable, then establish one supported licensing backend and a single evidence-based release path. Simplification should reduce operator choices and duplicated implementation while preserving the POS's reliable offline billing workflow.

### Recommended product shape

1. **Mini POS desktop app:** setup, products, billing, receipt printing, history, backup/restore, settings, and license status/activation.
2. **Admin web app:** customer search, issue a license, view license/device state, perform lifecycle actions, and inspect audit history.
3. **One canonical hosted licensing backend:** Supabase Edge Functions and Postgres, if the current deployment state and hosted QA verification support it. Keep the Node server as a local compatibility/test harness only until a documented cutover proves it can be retired.
4. **One release and testing workflow:** deterministic local tests, isolated hosted QA verification, signed desktop package verification, and explicit production deployment approval.

## 2. Repository map and product workflows

### Desktop POS

The desktop is an Electron app. React presentation code runs in the renderer; privileged database and OS operations run in Electron main through typed preload/IPC contracts. SQLite stores the local POS data. The intended cashier path is setup once, scan or search products, correct quantities, finalize/print, and recover a draft after a crash. The requirements explicitly keep core billing offline.

Key areas: `src/presentation`, `src/application`, `src/domain`, `src/infrastructure`, `electron`, `src/shared`.

### Admin web application

`admin-ui` is a separate React/Vite application. It authenticates administrators with Supabase Auth, calls the admin Edge Function, and presents dashboard, customer, license, device, settings, and audit screens. Roles and MFA are enforced on the backend, although some UI affordances are not role-aware.

### Licensing service

The desktop client uses device proof, server-issued signed authorization, local signature verification, device binding, and runtime check-in. The admin issues and manages licenses. The repository currently contains both:

- Supabase implementation: `supabase/functions` plus `supabase/migrations`.
- Node/Express implementation: `server/licensing` plus its own migrations and crypto/services.

This duplication is a major source of complexity. It creates two places to fix policy, validate security, and diagnose behavior. Existing docs also contain older migration plans that still call Supabase work “pending,” while newer reports describe Supabase as implemented locally. Documentation status needs to be reconciled against the actual deployed project before a backend is selected as production-authoritative.

### Other POS capabilities

The repository includes products, billing, history, setup, settings, keyboard/scanner workflows, ESC/POS and PDF printing, backup/restore, and local database migrations. The source and docs indicate a broad product, but this assessment did not manually execute each screen or hardware path.

## 3. Findings: what to address first

Severity is a prioritization for the next work cycle, not a claim that a live production system has been exploited.

| Priority | Finding | Evidence and consequence |
|---|---|---|
| **P0** | Plaintext license key is persisted by idempotency response replay. | `Router.handle()` clones every successful mutation response and stores its JSON in `admin_idempotency_keys.response_body`. The license create response contains `plaintextKey`. This conflicts with the UI promise that the plaintext is shown once and the claim that only its HMAC is stored. Restrict response persistence immediately; then design safe create-operation recovery without retaining plaintext in an ordinary database column. |
| **P0** | A retry after an ambiguous create can make another license and strand the first key. | `LicenseModal.handleSubmit()` generates `crypto.randomUUID()` for every click. The server's idempotency protection only recognizes the same key. If the license commits but the response is lost, a retry gets a new key and can create a duplicate. Preserve one operation ID for retries and make the outcome recoverable without leaking key material. |
| **P1** | Production admin API has a placeholder fallback URL. | `admin-ui/src/api/client.ts` falls back to `https://api.production.com/functions/v1/admin` when `VITE_ADMIN_API_URL` is missing. A release without the expected build value will fail to reach the actual backend. Production configuration should be required and checked at build/startup; never silently target a placeholder. |
| **P1** | Create flow hides useful failure details. | `adminFetch()` converts network failures and all 5xx responses into generic messages. This loses request IDs, server error codes, and actionable diagnostics, making license-generation failures hard to distinguish from connectivity/auth/configuration problems. Provide a safe user message plus a support reference ID and structured, redacted diagnostics. |
| **P1** | Admin license form is not operator-friendly. | It requests a raw product ID and optional customer UUID, accepts arbitrary strings, and uses a manually selected date/time. These are easy to mistype. Replace raw IDs with searchable product/customer selectors, date presets and a clear timezone display, and validate the effective dates before enabling submit. |
| **P1** | Role-aware admin UI is incomplete. | The licenses list sets `canManage = true` unconditionally. Backend authorization still applies, but users can be offered actions they cannot complete. Derive capabilities from `/admin/me`; show read-only mode clearly. |
| **P1** | Backend source of truth and deployment state are unclear. | Supabase and Node licensing implementations coexist. Docs include older migration matrices alongside newer local implementation reports. Existing release readiness says hosted migration/deployment and real MFA lifecycle verification are outstanding. Confirm the exact hosted environment, applied migrations, deployed function version, and client URL before diagnosing a particular live failure. |
| **P1** | The checkout is not a clean baseline. | At assessment time, `git status` showed many modified and untracked files across admin UI, Electron licensing, Supabase functions/migrations, tests, docs, and generated browser/test data. Do not discard, reset, or mix these changes with a cleanup. First label and preserve the current work, then review it in small commits. |
| **P2** | Too much overlapping process documentation. | There are many phase/certification reports and more than one licensing lifecycle/audit/test plan. Some describe historical status. Create a short index with one current product spec, architecture decision record, operator runbook, and release evidence index; mark old reports historical rather than deleting evidence. |
| **P2** | Admin list and data model surface internal identifiers. | License creation asks for customer UUID; list search language also mentions IDs. Most daily operators need business name, email, license suffix/status, device count, expiry, and last activity. Keep full IDs available in detail/support views, not as the primary workflow. |
| **P2** | Existing test inventory is broad, but confidence is fragmented. | There are unit, integration, browser, Electron, database, and hosted-oriented tests in multiple folders/configurations. Reports note that mocked UI and synthetic MFA do not establish real hosted behavior. One test catalog must state which environment and real dependencies each suite covers. |

### License-key generation: verified path and open diagnosis

The Supabase admin service generates a random human-readable key, computes an HMAC, stores the HMAC with the license, and returns `{ license, plaintextKey }`. The browser then displays the key in a one-time modal. The key format generator is therefore not the first suspected failure: current code has more consequential failure modes around response persistence, retry behavior, environment routing, MFA/backend authorization, and unhelpful errors.

Without the exact failing request and current hosted configuration, the initiating cause of the user's reported panel failures is **not yet proven**. The first diagnostic run should capture: selected environment (local/QA/production), API URL host (never tokens), HTTP status, server error code, request/correlation ID, whether a license row was committed, whether an idempotency record exists, and the user's role/MFA assurance. Never capture or paste a plaintext license key, access token, private key, or secret into a bug report.

## 4. Simplified workflows to target

### Cashier: everyday sale

1. Launch into a ready-to-scan billing screen after first-time setup.
2. Scan/search adds a product line; keyboard stays focused for the next item.
3. Quantity/price correction is available directly on the current line with clear undo/recovery.
4. One primary action completes and prints; print failure leaves the saved sale safe and offers a visible retry.
5. Network failure never prevents local billing. License status is explained separately from routine checkout.

### Owner: first-time store setup

1. Welcome → store name/currency/tax basics → add/import a few products → printer test → optional license activation → first sale.
2. Each step explains why it is needed and allows safe skip where the POS can still operate.
3. Use a progress indicator and a single “finish setup” state; avoid parallel settings that repeat the same choice.

### Admin: issue a license

1. Search/select the customer by name/email; create customer inline only if absent and permitted.
2. Select the product from a named catalog; choose a clear plan/duration preset; set device seats.
3. Show a review summary with customer, product, start/end times and timezone, seats, and environment badge.
4. Require the existing MFA step at the point of issuance and explain it in plain language.
5. Submit one operation ID. Disable duplicate submits. On timeout, offer “check result/retry same request,” never a fresh create request by default.
6. Show key once with copy and download/print options. Require an explicit “I saved it” action. Make key recovery a separately audited rotate/reissue action with revocation of the old key; do not store plaintext for convenience.
7. Land on license detail with activation instructions, binding count, status, expiry, and audit trail.

### Admin: support activation problem

1. Search customer, license, or device; show effective license state and last check-in.
2. Show a small plain-language diagnostic: key recognized, date valid, license enabled, device bound, seat limit, check-in current, server reachable.
3. For each failure, show next action and a request ID. Keep cryptographic internals in a support view.
4. Every mutation requires a reason, confirmation, role permission, MFA as policy requires, idempotency, and an audit event.

## 5. Delivery workflow: simplify safely in stages

### Stage 0 — Preserve and establish a trustworthy baseline

1. Make a named backup/branch of the current working tree; do not reset or bulk-clean uncommitted files.
2. Classify each changed file as user work, generated output, secret/config, or obsolete experiment. Preserve meaningful work; move only confirmed artifacts through reviewed commits.
3. Identify every environment without printing secrets: local, hosted QA, production. Record project refs, API URLs, migration head, deployed function version, signing-key ID, and owner in a restricted operational inventory.
4. Reconcile actual deployment state against `docs/licensing-release-readiness.md`, the migration history, and the current local code. Mark each statement verified, historical, or unknown.
5. Capture the exact license-create failure in QA using a test customer and synthetic key only. Collect sanitized request/error evidence.

**Exit gate:** clean, reproducible baseline instructions; named environment ownership; no destructive cleanup; one reproduced failure or a documented inability to reproduce.

### Stage 1 — Close the license creation safety and diagnosability gap

1. Stop saving plaintext create responses in generic idempotency storage. Add an explicit data-retention and migration plan for already persisted response bodies; inspect and clean only under a reviewed operational procedure.
2. Design a secure lost-response contract. Keep the operation idempotent while minimizing plaintext lifetime. Options to evaluate include a short-lived encrypted response envelope whose encryption key is outside the database, or a separate one-time key-delivery flow with audited reissue/rotation. Do not silently weaken “shown once.”
3. Generate the operation ID once per user-intended create and reuse it until definite success/failure. Bind idempotency records to admin, route, and canonical payload; define pending timeout/recovery and cleanup/retention.
4. Make database write + idempotency result atomic where possible. Ensure failures do not leave permanent `PENDING` entries or a license without a recoverable status.
5. Add request/correlation IDs and stable error codes across UI, Edge Function, and database logs. The UI should distinguish validation, session/MFA, permission, network, timeout/unknown outcome, and server failure.
6. Require production API/auth configuration explicitly. Add a fail-fast config check and a pre-package check that rejects example/placeholder domains and mismatched Auth/API projects.
7. Replace raw IDs in the create form with validated selectors and remove controls the logged-in role cannot use.

**Exit gate:** create, timeout-after-commit, duplicate click, same-request retry, different-payload replay, session-expiry, MFA, role-denial, network outage, and key-display recovery scenarios pass against isolated QA; plaintext key absent from ordinary DB/log/audit storage.

### Stage 2 — Establish one architecture and reduce cognitive load

1. Record a backend decision: Supabase hosted is canonical for deployed licensing, or Node is canonical. Do not operate both as equal production paths.
2. If Supabase is canonical, keep Node only as a test harness during a time-boxed parity period; run differential contract tests on activation, deactivation, check-in, admin create, lifecycle, and audit behavior; then remove deployment credentials/runbooks for the retired service.
3. If Node is canonical, document why, host it on managed infrastructure with its own database operations/SLO plan, and remove Supabase licensing route duplication. Supabase Auth may remain only if its role is explicit.
4. Keep SQLite local for POS operations. Define which data is local-only and which data is licensing/admin-only. Avoid introducing cloud sync for sales unless there is a separate product requirement.
5. Keep the desktop licensing boundary in Electron main and the renderer's IPC API narrow. Do not let admin auth or server secrets enter the desktop bundle.
6. Publish one current system diagram, one API contract, one lifecycle state machine, one migration owner, and a short index that points to historical certifications.

**Exit gate:** no ambiguity about the deployed backend, supported API version, source-of-truth migrations, key/signing secret ownership, or test target.

### Stage 3 — Simplify the actual product experience

1. Observe representative cashier and owner tasks; record completion time, errors, keyboard/mouse steps, and recovery.
2. Choose a small primary navigation: **Billing**, **Products**, **Sales history**, **Settings**. Put backup/restore, printer setup, diagnostics, and license information under Settings with clear labels.
3. Use a guided first-run checklist rather than a large settings surface. Make store-specific language and currency defaults explicit.
4. Ensure each screen has one primary action, useful empty/loading/error states, and no development-only controls in production.
5. Simplify license status into actionable states (Active, Needs internet check, Expired, Disabled, Revoked, Needs activation) and tell the cashier what still works.
6. Use customer/product names in admin and reserve UUIDs for detail/support diagnostics. Add search, clear filters, and a consistent detail layout.
7. Remove unused screens, old test helpers, duplicate scripts, and dead dependencies only after the baseline inventory shows no supported workflow depends on them.

**Exit gate:** task-based usability checks show that a new cashier can complete setup and first sale, and an admin can issue a license without UUID entry or duplicate creation.

### Stage 4 — Production assurance and release

Use a release candidate and immutable evidence. Keep the local POS, licensing backend, admin web app, and signed packages in one release manifest that records versions and environment.

1. Build/typecheck/lint every app and server package from a clean checkout.
2. Run unit and property tests for domain rules, key normalization, crypto vectors, time boundaries, state transitions, and validation.
3. Run database tests from empty schema through all migrations; verify constraints, RLS, audit append-only behavior, transaction rollback, concurrency, and restore procedures.
4. Run admin API authorization tests for every role × action, customer scope, MFA-required actions, idempotency races/replay, input validation, rate limits, and audit output.
5. Run admin UI tests against both mocks (fast feedback) and real QA (Auth/MFA/database); never treat mocks as hosted certification.
6. Run desktop IPC/security tests, POS workflows, printer/scanner hardware matrix, backup/restore, crash recovery, offline launch, check-in expiry, and license state transitions.
7. Run failure injection: DNS outage, backend timeout, database disconnect, repeated request, response lost after commit, clock skew, disk full, printer unplugged, app restart during bill/backup, invalid/expired/revoked key.
8. Test packaged signed artifacts on supported macOS/Windows versions. Verify update/install/uninstall, OS permissions, native identity persistence, and logs without secrets.
9. Deploy schema/function changes to QA first. Verify exact project identity in the run itself; use dedicated real MFA users and run-owned fixtures; record DB state before/after; clean only fixtures created by that run.
10. Require a release review of security findings, unresolved known issues, backup restore evidence, observability, support runbook, rollback plan, and migration compatibility before production deployment.

**Exit gate:** all release-blocking defects closed, QA evidence tied to the candidate commit/build, backups restored in a rehearsal, production config verified, and a tested rollback/forward-fix plan documented.

## 6. Testing standard: confidence layers

“Perfect testing” is not a realistic finite promise. The production standard should be traceable requirements, layered evidence, failure coverage, and known residual risk.

| Layer | Purpose | Examples |
|---|---|---|
| Static checks | Catch errors before execution | TypeScript, lint, dependency/license/security scan, secret scan, migration lint, package build. |
| Unit/property | Verify isolated rules | Totals/rounding, license date boundaries, key normalization, canonical JSON, signatures, role policy, state machine. |
| Component/API | Verify contracts | IPC input validation, admin endpoints, error shapes, idempotency, customer scoping. |
| Database/integration | Verify real transactions and constraints | Fresh migration, rollback, concurrent activation seat limits, audit atomicity, RLS, backup/restore. |
| UI/E2E | Verify full user tasks | First sale, issue license, activate key, lifecycle action, recovery after timeout. Run both mocked and real QA suites with distinct labels. |
| Hardware/packaged | Verify actual operating conditions | USB scanner, ESC/POS printer, signed installer, native identity, OS restart, offline startup. |
| Operational | Verify recoverability | Alerts, log correlation, backup restore drill, key rotation, incident and rollback rehearsal. |

Every release-blocking requirement should map to one or more named test cases and report its last passing candidate. Tests must not print keys, tokens, signatures containing sensitive payloads, or full customer data. Hosted writes must be guarded by an exact QA project allowlist.

## 7. Supabase versus a laptop server

### Recommendation

Use **managed Supabase for the hosted licensing/admin backend**, and keep the POS's daily billing data local in SQLite. Do not use a personal laptop as the customer-facing server. A laptop is appropriate for local development, isolated QA, or a controlled temporary demo, not as the production licensing authority.

The application can keep selling offline under its local policy; this makes a managed online licensing service a reasonable fit. Admin issuance, activation, deactivation, and periodic check-in need a backend reachable when administrators/customers are online.

### Why managed Supabase fits this project

- It already supplies Postgres, Auth, Edge Functions, and project-level secrets that the current code uses.
- It removes the need for you to maintain the server's physical availability, OS patching, power, ISP, router/firewall, public DNS/TLS, database operations, and incident response.
- Supabase documents globally routed Edge Functions and notes cold starts and runtime limits; the licensing endpoints are short request/response operations, so keep them idempotent and fast. See [Edge Functions](https://supabase.com/docs/guides/functions) and [function limits](https://supabase.com/docs/guides/functions/limits).
- Backups depend on plan: current documentation says Pro/Team/Enterprise receive daily database backups, with retention by plan; PITR is a paid add-on. Free projects require manual exports. Verify the exact plan and rehearse restore rather than assuming a backup exists. See [Database Backups](https://supabase.com/docs/guides/platform/backups).

### Why a laptop is unreliable as production hosting

A laptop server is unavailable when it sleeps, reboots, loses power or internet, changes networks, or is taken away. It also leaves backup, public exposure, firewall, TLS, patching, monitoring, database replication, and recovery entirely to you. For production you would need to turn that into a proper always-on server setup with redundant power/network, backups, monitoring, access controls, patching, and a tested restore plan—which is usually a worse fit than managed hosting for this scale.

### If you require self-hosting

Use a dedicated always-on server or cloud VM, containerize the stack, keep admin/database consoles off the public internet, automate off-site backups, monitor uptime/storage, patch on a schedule, and test disaster recovery. Supabase explicitly notes that self-hosting transfers provisioning, hardening, maintenance, HA/scaling, backups, disaster recovery, and monitoring to the operator; managed backups/PITR are not included in the self-hosted stack. See [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting) and [self-hosting FAQ](https://supabase.com/kb/faqs/platform/self-hosting).

### Important limitation

Managed Supabase does not itself guarantee that this particular project is production-ready. The current repo's own readiness notes say hosted migration/deployment and real hosted MFA/lifecycle verification were still outstanding in the latest audit records. Confirm the actual project, plan, database backup configuration, deployed functions, migrations, secrets, MFA setup, alerts, and restore evidence before relying on it.

## 8. Decisions required before implementation

1. Confirm Supabase Edge Functions are the one production licensing backend; if so, name the Node server's retirement date/temporary test-only scope.
2. Decide the supported licensing behavior during internet outages, including the existing signed check-in lease and exact billing block behavior. Preserve the documented seven-day policy unless the product owner explicitly changes it.
3. Choose a secure recovery policy for a create request whose license committed but whose plaintext key response was lost. Reissue/rotate should revoke the prior credential and create an audit event.
4. Define supported product/plan catalog, customer assignment requirements, currency/timezone policy, and whether unassigned licenses are allowed.
5. Set an operational target: expected customer count, support hours, acceptable licensing downtime, backup RPO/RTO, and budget/hosting plan.

## 9. Current status and next action

This document is a proposed plan and repository-based assessment, not hosted certification. The next concrete work should be Stage 0 baseline preservation followed by Stage 1 license-create remediation in isolated QA. Do not deploy the current working tree to production based solely on historical certification reports; first tie evidence to the exact candidate commit and live QA environment.
