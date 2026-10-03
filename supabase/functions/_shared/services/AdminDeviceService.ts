import type postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

export class AdminDeviceService {
  static async listDevices(sql: postgres.Sql, search: string = '', limit: number = 50, offset: number = 0) {
    if (limit > 100) limit = 100;
    
    let devices;
    if (search) {
      devices = await sql`
        SELECT device_key_id, status, created_at, last_seen_at 
        FROM devices 
        WHERE device_key_id ILIKE ${'%' + search + '%'}
        ORDER BY last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      devices = await sql`
        SELECT device_key_id, status, created_at, last_seen_at 
        FROM devices 
        ORDER BY last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    const [{ count }] = await sql`
      SELECT count(*) as count FROM devices
      ${search ? sql`WHERE device_key_id ILIKE ${'%' + search + '%'}` : sql``}
    `;

    return {
      data: devices,
      meta: { total: Number(count), limit, offset }
    };
  }

  static async getDevice(sql: postgres.Sql, deviceKeyId: string) {
    const [device] = await sql`
      SELECT device_key_id, status, created_at, last_seen_at 
      FROM devices 
      WHERE device_key_id = ${deviceKeyId}
    `;
    if (!device) throw new Error('DEVICE_NOT_FOUND');

    const bindings = await sql`
      SELECT id, license_id, status, activated_at, deactivated_at 
      FROM license_bindings 
      WHERE device_key_id = ${deviceKeyId}
      ORDER BY activated_at DESC
    `;

    return { ...device, bindings };
  }
}
