import type postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

export class AdminDashboardService {
  static async getSummary(sql: postgres.Sql) {
    const [{ total_customers }] = await sql`SELECT count(*) as total_customers FROM customers`;
    const [{ active_licenses }] = await sql`SELECT count(*) as active_licenses FROM licenses WHERE status = 'ACTIVE'`;
    const [{ revoked_licenses }] = await sql`SELECT count(*) as revoked_licenses FROM licenses WHERE status = 'REVOKED'`;
    const [{ active_bindings }] = await sql`SELECT count(*) as active_bindings FROM license_bindings WHERE status = 'ACTIVE'`;
    
    // Checkins summary
    const [{ recent_checkins }] = await sql`SELECT count(*) as recent_checkins FROM runtime_checkins WHERE checked_in_at > NOW() - INTERVAL '24 hours'`;
    const [{ overdue_checkins }] = await sql`SELECT count(*) as overdue_checkins FROM runtime_checkins WHERE check_in_valid_until < NOW()`;

    return {
      total_customers: Number(total_customers),
      active_licenses: Number(active_licenses),
      revoked_licenses: Number(revoked_licenses),
      active_bindings: Number(active_bindings),
      recent_checkins: Number(recent_checkins),
      overdue_checkins: Number(overdue_checkins)
    };
  }
}
