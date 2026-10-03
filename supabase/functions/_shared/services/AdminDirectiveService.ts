import type postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

export const CreateDirectiveSchema = z.object({
  target_binding_id: z.string().uuid(),
  type: z.enum(['DISPLAY_MESSAGE', 'REQUIRE_RECHECK', 'CONTACT_SUPPORT', 'REQUIRE_UPDATE', 'REQUIRE_DEACTIVATION']),
  payload: z.any().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
  requires_acknowledgement: z.boolean().default(true),
  expires_at: z.string().datetime().optional()
});

export class AdminDirectiveService {
  static async createDirective(tx: postgres.TransactionSql, data: z.infer<typeof CreateDirectiveSchema>, adminId: string) {
    const validated = CreateDirectiveSchema.parse(data);

    // Verify binding exists
    const [binding] = await tx`SELECT id FROM license_bindings WHERE id = ${validated.target_binding_id}`;
    if (!binding) throw new Error('BINDING_NOT_FOUND');

    const [directive] = await tx`
      INSERT INTO runtime_directives (
        target_binding_id, type, payload, priority, requires_acknowledgement, expires_at
      ) VALUES (
        ${validated.target_binding_id},
        ${validated.type},
        ${validated.payload ? JSON.stringify(validated.payload) : null},
        ${validated.priority},
        ${validated.requires_acknowledgement},
        ${validated.expires_at ? new Date(validated.expires_at).toISOString() : null}
      )
      RETURNING *
    `;

    await tx`
      INSERT INTO audit_events (event_type, details, admin_id)
      VALUES ('DIRECTIVE_CREATED', ${JSON.stringify(validated)}, ${adminId})
    `;

    return directive;
  }

  static async cancelDirective(tx: postgres.TransactionSql, directiveId: string, adminId: string) {
    const [directive] = await tx`
      UPDATE runtime_directives 
      SET status = 'CANCELLED' 
      WHERE directive_id = ${directiveId} AND status = 'PENDING'
      RETURNING *
    `;
    
    if (!directive) throw new Error('DIRECTIVE_NOT_FOUND_OR_NOT_PENDING');

    await tx`
      INSERT INTO audit_events (event_type, details, admin_id)
      VALUES ('DIRECTIVE_CANCELLED', ${JSON.stringify({ directiveId })}, ${adminId})
    `;

    return directive;
  }

  static async listDirectives(sql: postgres.Sql, limit: number = 50, offset: number = 0) {
    if (limit > 100) limit = 100;
    
    const directives = await sql`
      SELECT * FROM runtime_directives 
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await sql`SELECT count(*) as count FROM runtime_directives`;

    return {
      data: directives,
      meta: { total: Number(count), limit, offset }
    };
  }
}
