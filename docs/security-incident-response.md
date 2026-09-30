# Security Incident Response

This document outlines the standard operating procedures for security incidents regarding the Mini POS Licensing system.

## A. Server Signing Key Compromise

If the server's Ed25519 private key is exposed or suspected to be compromised:

1.  **Containment:** Stop issuing new licenses with the compromised key.
    *   Rotate the key (generate a new pair).
    *   Update the server environment with the new private key and a new Key ID.
2.  **Remediation:** Remove the compromised public key from the Electron client's trusted key registry (`AuthorizationVerifier`).
3.  **Client Update:** Release a mandatory client update containing only the new trusted key set.
4.  **Customer Communication:** Notify customers.
    *   *Note on Revocation Limitations:* Because Mini POS is offline-first without a mandatory heartbeat, offline clients cannot instantly learn of the key compromise. Their local authorizations will continue to function until they naturally expire (`validUntil`) or the device goes online and attempts a new licensing operation.

## B. Admin Credential Compromise

If the `ADMIN_API_TOKEN` is leaked:

1.  **Containment:** Generate a new 64+ character token.
2.  **Deployment:** Update the production environment and restart the server immediately.
3.  **Investigation:** Query the `audit_events` table for unauthorized administrative operations (e.g., `admin_reset`) that occurred during the window of compromise.
    ```sql
    SELECT * FROM audit_events WHERE created_at > 'YYYY-MM-DD HH:MM:SS';
    ```

## C. Database Compromise

If an unauthorized party gains access to the PostgreSQL database:

1.  **Containment:** Revoke unauthorized database credentials. Rotate all application database passwords.
2.  **Investigation:** Determine if `licenses`, `devices`, or `license_bindings` were modified.
    *   Compare `audit_events` against `lifecycle_requests` for discrepancies.
3.  **Remediation:** If the database state is unrecoverably altered, restore from the latest clean backup (see Phase 12 Production Runbook).

## D. Unauthorized License Issuance

If valid authorizations are being issued outside of normal commercial channels:

1.  **Investigation:** Review `audit_events` for activation successes. Cross-reference `product_id` and timestamps with external payment/billing systems.
2.  **Containment:** If a specific license key was stolen/leaked, mark its status as `REVOKED` in the database.
3.  **Remediation:** Revoked licenses will prevent future renewals or new device activations.

## E. Lifecycle Abuse (Replay Attacks)

If an attacker attempts to replay old activation/deactivation payloads:

*   **Mitigation:** The system is immune to this by design (Phase 3 Cryptographic Protocol). Replays will be rejected because the single-use `device_challenge` will have already been consumed or expired.
*   **Action:** No immediate action required. Monitor logs for increased abuse attempts (status `400` or `409`).

## F. API Flooding / Denial of Service

If the server experiences a volumetric attack:

*   **Mitigation:** The application layer rate limiting (`express-rate-limit`) will throttle abusive IPs.
*   **Action:** If application-layer limiting is insufficient, apply WAF (Web Application Firewall) rules at the infrastructure edge (e.g., Cloudflare, AWS WAF).

## G. Malicious Client Reports (Fake Offline)

If a user prevents the client from contacting the server to avoid deactivation:

*   **Limitation:** This is a known limitation of the offline-first architecture. We do not use technical leases or heartbeat.
*   **Mitigation:** The authorization will naturally expire at `validUntil`. Upon expiration, the client will demand a fresh authorization.

## H. Suspected Native Helper Compromise

If the macOS secure enclave helper (`minipos-identity`) is suspected of leaking the private P-256 key:

1.  **Investigation:** Reverse engineer the suspect artifact to determine if the key is exportable (it should be hardware-bound).
2.  **Remediation:** Issue a client patch updating the helper binary. The `deviceKeyId` for affected devices will change because a new hardware key pair will be generated. Users will need to perform an Admin Reset to bind their new device identity to their license.
