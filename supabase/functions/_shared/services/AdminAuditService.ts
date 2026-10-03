import type postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

export class AdminAuditService {
  static async listEvents(sql: postgres.Sql, limit: number = 50, offset: number = 0) {
    if (limit > 100) limit = 100;
    
    // Explicitly select fields without exposing full raw payloads if any secret exists,
    // though audit_events should not contain secrets.
    const events = await sql`
      SELECT id, event_type, license_id, device_key_id, request_id, details, admin_id, created_at 
      FROM audit_events 
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await sql`SELECT count(*) as count FROM audit_events`;

    return {
      data: events,
      meta: { total: Number(count), limit, offset }
    };
  }
}
