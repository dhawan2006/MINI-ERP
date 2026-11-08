import type postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import type { AdminAuthResult } from '../middleware/adminAuth.ts';

export class AdminAuditService {
  /**
   * List audit events with server-side customer-scope isolation.
   *
   * CUSTOMER scoped: only includes events recorded by this customer's admin.
   * GLOBAL (SUPPORT/SYSTEM): all audit events.
   */
  static async listEvents(
    sql: postgres.Sql,
    auth: AdminAuthResult,
    limit: number = 50,
    offset: number = 0
  ) {
    if (limit > 100) limit = 100;
    const isCustomerScoped = auth.scopeType === 'CUSTOMER';

    let events: postgres.RowList<Record<string, unknown>[]>;
    let total: number;

    if (isCustomerScoped) {
      events = await sql`
        SELECT ae.id, ae.event_type, ae.details, ae.admin_id, ae.created_at
        FROM audit_events ae
        WHERE ae.admin_id = ${auth.adminId}
        ORDER BY ae.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const [{ count }] = await sql`
        SELECT count(*) AS count
        FROM audit_events ae
        WHERE ae.admin_id = ${auth.adminId}
      `;
      total = Number(count);
    } else {
      events = await sql`
        SELECT id, event_type, details, admin_id, created_at
        FROM audit_events
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const [{ count }] = await sql`SELECT count(*) AS count FROM audit_events`;
      total = Number(count);
    }

    return { data: events, meta: { total, limit, offset } };
  }
}
