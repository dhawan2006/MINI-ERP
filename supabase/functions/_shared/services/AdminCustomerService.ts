import type postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import type { AdminAuthResult } from '../middleware/adminAuth.ts';

export const CustomerSchema = z.object({
  business_name: z.string().max(255).optional().nullable(),
  contact_name: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
});

export class AdminCustomerService {
  /**
   * List customers with server-side customer-scope isolation.
   *
   * GLOBAL (SUPPORT/SYSTEM): returns all non-sentinel customers, paginated.
   * CUSTOMER scoped (OWNER/ADMIN/FINANCE/AUDITOR): returns only the admin's
   * own customer — a single row or empty. Search is still applied.
   *
   * COUNT is computed from the same predicate so pagination never leaks
   * another customer's existence.
   */
  static async listCustomers(
    sql: postgres.Sql,
    auth: AdminAuthResult,
    search: string = '',
    limit: number = 50,
    offset: number = 0
  ) {
    if (limit > 100) limit = 100;
    const query = search ? `%${search}%` : null;

    const isCustomerScoped = auth.scopeType === 'CUSTOMER';
    const scopedId = auth.customerId ?? null;

    // Build the base WHERE predicate fragments.
    // All paths exclude the sentinel (is_sentinel = FALSE) because real admins
    // should never see the migration-placeholder customer.
    let customers: postgres.RowList<Record<string, unknown>[]>;
    let total: number;

    if (isCustomerScoped) {
      // Scoped: exactly one customer row or nothing, search applied within it.
      if (query) {
        customers = await sql`
          SELECT id, business_name, contact_name, email, phone, created_at, updated_at
          FROM customers
          WHERE id = ${scopedId}
            AND is_sentinel = FALSE
            AND (
              business_name ILIKE ${query}
              OR contact_name ILIKE ${query}
              OR email ILIKE ${query}
            )
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
        const [{ count }] = await sql`
          SELECT count(*) AS count
          FROM customers
          WHERE id = ${scopedId}
            AND is_sentinel = FALSE
            AND (
              business_name ILIKE ${query}
              OR contact_name ILIKE ${query}
              OR email ILIKE ${query}
            )
        `;
        total = Number(count);
      } else {
        customers = await sql`
          SELECT id, business_name, contact_name, email, phone, created_at, updated_at
          FROM customers
          WHERE id = ${scopedId}
            AND is_sentinel = FALSE
          LIMIT ${limit} OFFSET ${offset}
        `;
        const [{ count }] = await sql`
          SELECT count(*) AS count FROM customers
          WHERE id = ${scopedId} AND is_sentinel = FALSE
        `;
        total = Number(count);
      }
    } else {
      // Global: all non-sentinel customers
      if (query) {
        customers = await sql`
          SELECT id, business_name, contact_name, email, phone, created_at, updated_at
          FROM customers
          WHERE is_sentinel = FALSE
            AND (
              business_name ILIKE ${query}
              OR contact_name ILIKE ${query}
              OR email ILIKE ${query}
            )
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
        const [{ count }] = await sql`
          SELECT count(*) AS count FROM customers
          WHERE is_sentinel = FALSE
            AND (
              business_name ILIKE ${query}
              OR contact_name ILIKE ${query}
              OR email ILIKE ${query}
            )
        `;
        total = Number(count);
      } else {
        customers = await sql`
          SELECT id, business_name, contact_name, email, phone, created_at, updated_at
          FROM customers
          WHERE is_sentinel = FALSE
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
        const [{ count }] = await sql`
          SELECT count(*) AS count FROM customers WHERE is_sentinel = FALSE
        `;
        total = Number(count);
      }
    }

    return {
      data: customers,
      meta: { total, limit, offset }
    };
  }

  /**
   * Get a single customer by id with ownership check.
   *
   * CUSTOMER scoped: only returns the customer if id == auth.customerId.
   * Any mismatch (including another customer's id) → throws NOT_FOUND (404).
   * Sentinel is always excluded.
   * GLOBAL: any non-sentinel customer.
   */
  static async getCustomer(sql: postgres.Sql, auth: AdminAuthResult, id: string) {
    const isCustomerScoped = auth.scopeType === 'CUSTOMER';

    const [customer] = isCustomerScoped
      ? await sql`
          SELECT id, business_name, contact_name, email, phone, created_at, updated_at
          FROM customers
          WHERE id = ${id}
            AND id = ${auth.customerId!}
            AND is_sentinel = FALSE
        `
      : await sql`
          SELECT id, business_name, contact_name, email, phone, created_at, updated_at
          FROM customers
          WHERE id = ${id}
            AND is_sentinel = FALSE
        `;

    if (!customer) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }
    return customer;
  }

  /**
   * Create customer. Only GLOBAL roles (SUPPORT/SYSTEM) or OWNER/ADMIN/FINANCE
   * with GLOBAL scope may create new tenants.
   *
   * Customer-scoped admins MUST NOT call this — the route policy restricts to
   * OWNER/ADMIN/FINANCE with requireMfa. However, at the service level we also
   * prevent a scoped admin from calling createCustomer (this is belt-and-suspenders;
   * route permissions are already restrictive).
   *
   * The created customer is never the sentinel.
   */
  static async createCustomer(
    tx: postgres.TransactionSql,
    data: z.infer<typeof CustomerSchema>,
    adminId: string
  ) {
    const validated = CustomerSchema.parse(data);
    const [customer] = await tx`
      INSERT INTO customers (business_name, contact_name, email, phone)
      VALUES (${validated.business_name || null}, ${validated.contact_name || null}, ${validated.email || null}, ${validated.phone || null})
      RETURNING id, business_name, contact_name, email, phone, created_at, updated_at
    `;

    await tx`
      INSERT INTO audit_events (event_type, details, admin_id)
      VALUES ('CUSTOMER_CREATED', ${JSON.stringify(validated)}, ${adminId})
    `;

    return customer;
  }

  /**
   * Update customer with ownership check.
   *
   * CUSTOMER scoped: only updates id == auth.customerId. Cross-customer id → 404.
   * GLOBAL: any non-sentinel customer.
   */
  static async updateCustomer(
    tx: postgres.TransactionSql,
    auth: AdminAuthResult,
    id: string,
    data: z.infer<typeof CustomerSchema>,
    adminId: string
  ) {
    const validated = CustomerSchema.parse(data);
    const isCustomerScoped = auth.scopeType === 'CUSTOMER';

    // Scoped admin: verify they own this customer before mutating
    if (isCustomerScoped && auth.customerId !== id) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }

    const [customer] = await tx`
      UPDATE customers
      SET business_name = COALESCE(${validated.business_name}, business_name),
          contact_name  = COALESCE(${validated.contact_name}, contact_name),
          email         = COALESCE(${validated.email}, email),
          phone         = COALESCE(${validated.phone}, phone),
          updated_at    = NOW()
      WHERE id = ${id}
        AND is_sentinel = FALSE
      RETURNING id, business_name, contact_name, email, phone, created_at, updated_at
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
