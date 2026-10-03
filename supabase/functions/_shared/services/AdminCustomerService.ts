import type postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

export const CustomerSchema = z.object({
  business_name: z.string().max(255).optional().nullable(),
  contact_name: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
});

export class AdminCustomerService {
  static async listCustomers(sql: postgres.Sql, search: string = '', limit: number = 50, offset: number = 0) {
    if (limit > 100) limit = 100;
    
    // search across business_name, contact_name, email
    const query = search ? `%${search}%` : null;
    
    let customers;
    if (query) {
      customers = await sql`
        SELECT * FROM customers 
        WHERE business_name ILIKE ${query} 
           OR contact_name ILIKE ${query} 
           OR email ILIKE ${query}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      customers = await sql`
        SELECT * FROM customers 
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    const [{ count }] = await sql`
      SELECT count(*) as count FROM customers
      ${query ? sql`WHERE business_name ILIKE ${query} OR contact_name ILIKE ${query} OR email ILIKE ${query}` : sql``}
    `;

    return {
      data: customers,
      meta: {
        total: Number(count),
        limit,
        offset
      }
    };
  }

  static async getCustomer(sql: postgres.Sql, id: string) {
    const [customer] = await sql`SELECT * FROM customers WHERE id = ${id}`;
    if (!customer) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }
    return customer;
  }

  static async createCustomer(tx: postgres.TransactionSql, data: z.infer<typeof CustomerSchema>, adminId: string) {
    const validated = CustomerSchema.parse(data);
    const [customer] = await tx`
      INSERT INTO customers (business_name, contact_name, email, phone)
      VALUES (${validated.business_name || null}, ${validated.contact_name || null}, ${validated.email || null}, ${validated.phone || null})
      RETURNING *
    `;

    await tx`
      INSERT INTO audit_events (event_type, details, admin_id)
      VALUES ('CUSTOMER_CREATED', ${JSON.stringify(validated)}, ${adminId})
    `;

    return customer;
  }

  static async updateCustomer(tx: postgres.TransactionSql, id: string, data: z.infer<typeof CustomerSchema>, adminId: string) {
    const validated = CustomerSchema.parse(data);
    const [customer] = await tx`
      UPDATE customers 
      SET business_name = COALESCE(${validated.business_name}, business_name),
          contact_name = COALESCE(${validated.contact_name}, contact_name),
          email = COALESCE(${validated.email}, email),
          phone = COALESCE(${validated.phone}, phone),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (!customer) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }

    await tx`
      INSERT INTO audit_events (event_type, details, admin_id)
      VALUES ('CUSTOMER_UPDATED', ${JSON.stringify({ id, ...validated })}, ${adminId})
    `;

    return customer;
  }
}
