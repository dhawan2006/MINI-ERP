import type postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { hashLicenseKey } from '../crypto/licenseKey.ts';

export const CreateLicenseSchema = z.object({
  product_id: z.string().min(1),
  max_devices: z.number().int().positive(),
  valid_from: z.string().datetime().optional(), // ISO string
  valid_until: z.string().datetime(), // ISO string
  customer_id: z.string().uuid().optional().nullable()
});

function generateSecureLicenseKey(): string {
  const array = new Uint8Array(24); // 24 random bytes
  crypto.getRandomValues(array);
  
  // Format as XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let key = '';
  for (let i = 0; i < 20; i++) {
    key += base32chars[array[i] % 32];
    if (i % 4 === 3 && i !== 19) {
      key += '-';
    }
  }
  return key;
}

export class AdminLicenseService {
  static async createLicense(
    tx: postgres.TransactionSql,
    data: z.infer<typeof CreateLicenseSchema>,
    adminId: string
  ) {
    const validated = CreateLicenseSchema.parse(data);
    const plaintextKey = generateSecureLicenseKey();

    const hmacSecret = Deno.env.get('LICENSE_KEY_HMAC_SECRET');
    if (!hmacSecret) throw new Error('Missing LICENSE_KEY_HMAC_SECRET');

    const hmac = await hashLicenseKey(plaintextKey, hmacSecret);

    const [license] = await tx`
      INSERT INTO licenses (
        product_id, 
        license_key_hmac, 
        status, 
        valid_from, 
        valid_until, 
        max_devices, 
        customer_id
      ) VALUES (
        ${validated.product_id},
        ${hmac},
        'ACTIVE',
        ${validated.valid_from ? new Date(validated.valid_from).toISOString() : new Date().toISOString()},
        ${new Date(validated.valid_until).toISOString()},
        ${validated.max_devices},
        ${validated.customer_id || null}
      )
      RETURNING id, product_id, status, valid_from, valid_until, max_devices, customer_id, created_at, updated_at
    `;

    // Audit event without plaintext key
    await tx`
      INSERT INTO audit_events (event_type, details, license_id, admin_id)
      VALUES ('LICENSE_CREATED', ${JSON.stringify(validated)}, ${license.id}, ${adminId})
    `;

    return {
      license,
      plaintextKey // ONLY return this once.
    };
  }

  static async listLicenses(sql: postgres.Sql, search: string = '', limit: number = 50, offset: number = 0) {
    if (limit > 100) limit = 100;
    
    // search across product_id or customer_id if exact match
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
    
    let licenses;
    if (search) {
      licenses = await sql`
        SELECT id, product_id, status, valid_from, valid_until, max_devices, customer_id, created_at, updated_at 
        FROM licenses 
        WHERE product_id ILIKE ${'%' + search + '%'}
           OR (${isUuid}::boolean AND customer_id = ${isUuid ? search : null})
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      licenses = await sql`
        SELECT id, product_id, status, valid_from, valid_until, max_devices, customer_id, created_at, updated_at 
        FROM licenses 
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    const [{ count }] = await sql`
      SELECT count(*) as count FROM licenses
      ${search ? sql`WHERE product_id ILIKE ${'%' + search + '%'} OR (${isUuid}::boolean AND customer_id = ${isUuid ? search : null})` : sql``}
    `;

    return {
      data: licenses,
      meta: {
        total: Number(count),
        limit,
        offset
      }
    };
  }

  static async getLicense(sql: postgres.Sql, id: string) {
    const [license] = await sql`
      SELECT id, product_id, status, valid_from, valid_until, max_devices, customer_id, created_at, updated_at, revoked_at
      FROM licenses 
      WHERE id = ${id}
    `;
    if (!license) {
      throw new Error('LICENSE_NOT_FOUND');
    }
    return license;
  }
}
