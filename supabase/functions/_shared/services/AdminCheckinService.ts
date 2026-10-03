import type postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

export class AdminCheckinService {
  static async listCheckins(sql: postgres.Sql, limit: number = 50, offset: number = 0) {
    if (limit > 100) limit = 100;
    
    const checkins = await sql`
      SELECT c.receipt_id, c.binding_id, c.checked_in_at, c.check_in_valid_until, c.status,
             b.device_key_id, b.license_id
      FROM runtime_checkins c
      JOIN license_bindings b ON c.binding_id = b.id
      ORDER BY c.checked_in_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await sql`SELECT count(*) as count FROM runtime_checkins`;

    return {
      data: checkins,
      meta: { total: Number(count), limit, offset }
    };
  }

  static async getBindingCheckinStatus(sql: postgres.Sql, bindingId: string) {
    const [latest] = await sql`
      SELECT receipt_id, checked_in_at, check_in_valid_until, status
      FROM runtime_checkins
      WHERE binding_id = ${bindingId}
      ORDER BY checked_in_at DESC
      LIMIT 1
    `;

    return latest || null;
  }
}
