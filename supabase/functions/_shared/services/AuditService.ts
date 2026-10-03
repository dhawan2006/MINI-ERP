import { Sql } from '../database/db.ts';

export class AuditService {
  static async recordEvent(
    tx: Sql,
    eventType: string,
    details: Record<string, any>,
    licenseId?: string,
    deviceKeyId?: string,
    requestId?: string,
    adminId?: string
  ): Promise<void> {
    await tx`
      INSERT INTO audit_events (event_type, license_id, device_key_id, request_id, details, admin_id)
      VALUES (${eventType}, ${licenseId || null}, ${deviceKeyId || null}, ${requestId || null}, ${details}, ${adminId || null})
    `;
  }
}
