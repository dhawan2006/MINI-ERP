import { corsHeaders } from '../http/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { getDb } from '../database/db.ts';

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  const key = await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigA = new Uint8Array(await crypto.subtle.sign('HMAC', key, aBytes));
  const sigB = new Uint8Array(await crypto.subtle.sign('HMAC', key, bBytes));

  let res = 0;
  for (let i = 0; i < sigA.length; i++) {
    res |= sigA[i] ^ sigB[i];
  }
  return res === 0;
}

export type AdminRole = 'OWNER' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'AUDITOR' | 'SYSTEM';

export interface AdminAuthResult {
  authorized: boolean;
  response?: Response;
  correlationId: string;
  adminId?: string;
  role?: AdminRole;
  aal?: string;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_ANON_KEY') || ''
);

export async function adminAuth(req: Request, requiredRoles?: AdminRole[], requireMfa: boolean = false): Promise<AdminAuthResult> {
  const correlationId = req.headers.get('x-correlation-id') || crypto.randomUUID();
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authorized: false,
      correlationId,
      response: new Response(JSON.stringify({ error: 'ADMIN_UNAUTHORIZED', message: 'Missing Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    };
  }

  const token = authHeader.substring(7);
  const expectedToken = Deno.env.get('ADMIN_API_TOKEN');

  // 1. Check for legacy SYSTEM token (used by integration tests / backend scripts)
  if (expectedToken && await timingSafeEqual(token, expectedToken)) {
    if (requiredRoles && !requiredRoles.includes('SYSTEM')) {
       return {
        authorized: false,
        correlationId,
        response: new Response(JSON.stringify({ error: 'ADMIN_FORBIDDEN', message: 'SYSTEM token not allowed for this route' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      };
    }
    return { authorized: true, correlationId, role: 'SYSTEM', adminId: 'system' };
  }

  // 2. Check for Supabase Auth JWT
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    return {
      authorized: false,
      correlationId,
      response: new Response(JSON.stringify({ error: 'ADMIN_UNAUTHORIZED', message: 'Invalid admin credentials' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    };
  }

  // Determine AAL level from the JWT
  // Get the authenticators assurance level from the JWT.
  // Actually, supabase.auth.getUser does not directly expose AAL from JWT. 
  // We can get it via supabase.auth.mfa.getAuthenticatorAssuranceLevel if we have a session, but we only have a token.
  // Let's decode the JWT payload manually to get 'aal'.
  let aal = 'aal1';
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.aal) {
        aal = payload.aal;
      }
    }
  } catch (e) {
    // Ignore decode error
  }

  const sql = getDb();
  let roleResult;
  try {
    roleResult = await sql`SELECT role FROM admin_roles WHERE admin_id = ${user.id} LIMIT 1`;
  } catch (err) {
    console.error('Error fetching admin role', err);
    return {
      authorized: false,
      correlationId,
      response: new Response(JSON.stringify({ error: 'INTERNAL_ERROR', message: 'Failed to verify admin role' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    };
  }

  if (!roleResult || roleResult.length === 0) {
    return {
      authorized: false,
      correlationId,
      response: new Response(JSON.stringify({ error: 'ADMIN_FORBIDDEN', message: 'User does not have an admin role' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    };
  }

  const role = roleResult[0].role as AdminRole;

  if (requiredRoles && !requiredRoles.includes(role)) {
    return {
      authorized: false,
      correlationId,
      response: new Response(JSON.stringify({ error: 'ADMIN_FORBIDDEN', message: 'Insufficient role for this operation' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    };
  }

  if (requireMfa && (role === 'OWNER' || role === 'ADMIN')) {
    if (aal !== 'aal2') {
      return {
        authorized: false,
        correlationId,
        response: new Response(JSON.stringify({ error: 'MFA_REQUIRED', message: 'MFA (AAL2) is required for this operation' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      };
    }
  }

  return { authorized: true, correlationId, adminId: user.id, role, aal };
}
