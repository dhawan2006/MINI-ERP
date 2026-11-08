# Phase 12 — Production Runbook

This runbook covers routine operations, deployment, and configuration for the Mini POS Licensing Server.

## 1. Environment Configuration

The production server requires strict environment configuration. Startup will fail if any required variables are missing or insecure.

Create a `.env.production` file (or use your host's secret manager) based on `.env.production.example`.

**Mandatory Variables:**
*   `NODE_ENV=production`
*   `DATABASE_URL`: Must point to an external PostgreSQL instance (not `localhost`).
*   `ADMIN_API_TOKEN`: Minimum 64 characters.
*   `LICENSE_KEY_HMAC_SECRET`: Minimum 64 characters.
*   `LICENSING_SERVER_PRIVATE_KEY`: Ed25519 PKCS#8 PEM string (newlines replaced with `\n` if passed via standard env vars).
*   `LICENSING_SERVER_KEY_ID`: Identifier matching the public key shipped in the Electron client.

## 2. Production Deployment

1.  **Build Server:**
    ```bash
    npm run build
    ```
2.  **Run Migrations:**
    Migrations must be executed before starting the server. Migrations are idempotent and additive.
    ```bash
    npm run migrate
    ```
3.  **Start Server:**
    ```bash
    npm start
    ```
    *The server executes a self-check before accepting requests to ensure DB connectivity, schema validity, and secret presence.*

## 3. Database Migration

Migrations in production are strictly additive. They will never drop tables or columns.

*   **Command:** `npx tsx scripts/migrate.ts`
*   **Rollback:** If a migration fails mid-execution, its own transaction is rolled back. Previous migrations remain intact.

## 4. Signing-Key Rotation

Rotating the server signing key allows you to issue new authorizations with a new key, while old authorizations remain valid until their expiration.

1.  **Generate New Key Pair:**
    ```bash
    openssl genpkey -algorithm ed25519 -out new-signing.pem
    openssl pkey -in new-signing.pem -pubout -out new-public.pem
    ```
2.  **Update Client Artifact:**
    *   Embed `new-public.pem` into the Electron client's trusted key set with a new Key ID (e.g., `prod-key-2`).
    *   Release the client update. Wait for client adoption.
3.  **Update Server Environment:**
    *   Change `LICENSING_SERVER_PRIVATE_KEY` to the new PEM.
    *   Change `LICENSING_SERVER_KEY_ID` to `prod-key-2`.
4.  **Restart Server:**
    *   New authorizations will now be signed with `prod-key-2`.

## 5. Admin Credential Rotation

1.  Generate a new token: `openssl rand -hex 64`
2.  Update `ADMIN_API_TOKEN` in the production environment.
3.  Restart the licensing server.

## 6. Backup and Restore

### Backup
*   **Frequency:** Daily automated snapshots + WAL (Write-Ahead Logging) archiving for point-in-time recovery.
*   **Command:** Use `pg_dump` for manual backups.
    ```bash
    pg_dump $DATABASE_URL -F c -f minipos_licensing_backup.dump
    ```

### Restore
1.  Provision a clean database.
2.  Apply the backup using `pg_restore`:
    ```bash
    pg_restore -d $NEW_DATABASE_URL -1 minipos_licensing_backup.dump
    ```
3.  Run the server startup checks to verify schema integrity.

## 7. Rollback

If a deployment fails:
1.  Revert the application code to the previous release tag.
2.  **Do not rollback the database schema** unless explicitly instructed by an emergency patch. The additive migrations are designed to be forward-compatible with older server code.
3.  Restart the server and verify the startup self-checks pass.

## 8. Client Release

1.  Ensure the correct public verification keys are embedded in `AuthorizationVerifier`.
2.  Run `npm run build` to generate the production artifact.
3.  Run `scripts/ci-security-validate.sh` to ensure no test credentials or bypasses are packaged.
4.  Sign and notarize the macOS `.app` bundle before distribution.
