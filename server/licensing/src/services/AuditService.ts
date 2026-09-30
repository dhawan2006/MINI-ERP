import { PoolClient } from 'pg';

export class AuditService {
  /**
   * Records a security-relevant event within the provided transaction client.
   */
  static async recordEvent(
    client: PoolClient,
    eventType: string,
    details: Record<string, any>,
    licenseId?: string,
    deviceKeyId?: string,
    requestId?: string,
    adminId?: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (event_type, license_id, device_key_id, request_id, details, admin_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        eventType,
        licenseId || null,
        deviceKeyId || null,
        requestId || null,
        JSON.stringify(details),
        adminId || null
      ]
    );
  }
}
