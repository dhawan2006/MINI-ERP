import { handleCors, corsHeaders } from '../_shared/http/cors.ts';
import { getDb } from '../_shared/database/db.ts';
import { adminAuth } from '../_shared/middleware/adminAuth.ts';
import { Router } from '../_shared/http/Router.ts';
import { AdminCustomerService, CustomerSchema } from '../_shared/services/AdminCustomerService.ts';
import { AdminAuditService } from '../_shared/services/AdminAuditService.ts';
import { AdminDashboardService } from '../_shared/services/AdminDashboardService.ts';

const router = new Router('/admin');

// --- Customers ---
router.add('GET', '/customers', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR', 'SYSTEM'] }, async (req) => {
  const auth = (req as any).adminAuth;
  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const sql = getDb();
  const result = await AdminCustomerService.listCustomers(sql, auth, search, limit, offset);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('POST', '/customers', { roles: ['OWNER', 'ADMIN', 'FINANCE'], requireMfa: true }, async (req) => {
  const auth = (req as any).adminAuth;
  const body = await req.json();
  const sql = getDb();
  const result = await sql.begin(async (tx) => {
    return await AdminCustomerService.createCustomer(tx, body, auth.adminId);
  });
  return new Response(JSON.stringify(result), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('GET', '/customers/:id', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR', 'SYSTEM'] }, async (req, url, params) => {
  const auth = (req as any).adminAuth;
  const sql = getDb();
  const result = await AdminCustomerService.getCustomer(sql, auth, params.id);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('PUT', '/customers/:id', { roles: ['OWNER', 'ADMIN', 'FINANCE', 'SYSTEM'], requireMfa: true }, async (req, url, params) => {
  const auth = (req as any).adminAuth;
  const body = await req.json();
  const sql = getDb();
  const result = await sql.begin(async (tx) => {
    return await AdminCustomerService.updateCustomer(tx, auth, params.id, body, auth.adminId);
  });
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// --- Audit ---
router.add('GET', '/audit', { roles: ['OWNER', 'ADMIN', 'AUDITOR', 'SYSTEM'] }, async (req) => {
  const auth = (req as any).adminAuth;
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const sql = getDb();
  const result = await AdminAuditService.listEvents(sql, auth, limit, offset);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// --- Dashboard ---
router.add('GET', '/dashboard/summary', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR', 'SYSTEM'] }, async (req) => {
  const auth = (req as any).adminAuth;
  const sql = getDb();
  const result = await AdminDashboardService.getSummary(sql, auth);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('GET', '/me', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR', 'SYSTEM'] }, async (req) => {
  const auth = (req as any).adminAuth;
  return new Response(JSON.stringify({
    adminId: auth.adminId,
    role: auth.role,
    aal: auth.aal,
    scopeType: auth.scopeType,
    customerId: auth.customerId,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// /_test/* endpoints — DEVELOPMENT/TEST ONLY
const TEST_ROUTES_ENABLED = Deno.env.get('ADMIN_TEST_ROUTES_ENABLED') === 'true';

if (TEST_ROUTES_ENABLED) {
  router.add('POST', '/_test/scope-check', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR', 'SYSTEM'] }, async (req) => {
    const auth = (req as any).adminAuth;
    const body = await req.json();
    const { targetCustomerId } = body;

    const { AdminScopeService, AdminScopeError } = await import('../_shared/services/AdminScopeService.ts');

    try {
      AdminScopeService.assertCustomerAccess(auth, targetCustomerId);
      return new Response(JSON.stringify({ status: 'ALLOW' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (err: any) {
      if (err instanceof AdminScopeError) {
        return new Response(JSON.stringify({ status: 'DENY', reason: err.message }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw err;
    }
  });
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const response = await router.handle(req);
    if (response) {
      return response;
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    if (err.name === 'ZodError') {
       return new Response(JSON.stringify({ error: 'VALIDATION_ERROR', message: err.errors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const notFoundMessages = ['CUSTOMER_NOT_FOUND'];
    if (notFoundMessages.includes(err.message)) {
      return new Response(JSON.stringify({ error: 'NOT_FOUND', message: err.message }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.error('Unhandled admin error:', err);
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR', message: 'An internal server error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
