import type postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import type { AdminAuthResult } from '../middleware/adminAuth.ts';

export class AdminDashboardService {
  /**
   * Get dashboard summary counts with server-side customer-scope isolation.
   *
   * CUSTOMER scoped: counts are filtered to auth.customerId.
   *   - total_customers: always 1 (or 0 if sentinel)
   *
   * GLOBAL (SUPPORT/SYSTEM): global counts, excluding sentinel customer.
   */
  static async getSummary(sql: postgres.Sql, auth: AdminAuthResult) {
    const isCustomerScoped = auth.scopeType === 'CUSTOMER';
    const scopedId = auth.customerId ?? null;

    if (isCustomerScoped) {
      const [{ total_customers }] = await sql`
        SELECT count(*) AS total_customers FROM customers
        WHERE id = ${scopedId} AND is_sentinel = FALSE
      `;
      return {
        total_customers: Number(total_customers)
      };
    }

    const [{ total_customers }] = await sql`
      SELECT count(*) AS total_customers FROM customers WHERE is_sentinel = FALSE
    `;
    return {
      total_customers: Number(total_customers)
    };
  }
}
