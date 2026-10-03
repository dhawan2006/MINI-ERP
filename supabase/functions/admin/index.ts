import { handleCors, corsHeaders } from '../_shared/http/cors.ts';
import { getDb } from '../_shared/database/db.ts';
import { adminAuth } from '../_shared/middleware/adminAuth.ts';
import { Router } from '../_shared/http/Router.ts';
import { AdminCustomerService, CustomerSchema } from '../_shared/services/AdminCustomerService.ts';
import { AdminLicenseService, CreateLicenseSchema } from '../_shared/services/AdminLicenseService.ts';
import { AdminLifecycleService, AdminLifecycleError } from '../_shared/services/AdminLifecycleService.ts';
import { AdminDeviceService } from '../_shared/services/AdminDeviceService.ts';
import { AdminCheckinService } from '../_shared/services/AdminCheckinService.ts';
import { AdminDirectiveService, CreateDirectiveSchema } from '../_shared/services/AdminDirectiveService.ts';
import { AdminAuditService } from '../_shared/services/AdminAuditService.ts';
import { AdminDashboardService } from '../_shared/services/AdminDashboardService.ts';

const router = new Router('/admin');

// --- Customers ---
router.add('GET', '/customers', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR'] }, async (req) => {
  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  
  const sql = getDb();
  const result = await AdminCustomerService.listCustomers(sql, search, limit, offset);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('POST', '/customers', { roles: ['OWNER', 'ADMIN', 'FINANCE'], requireMfa: true }, async (req) => {
  const auth = (req as any).adminAuth; // Set by middleware wrapper
  const body = await req.json();
  const sql = getDb();
  
  const result = await sql.begin(async (tx) => {
    return await AdminCustomerService.createCustomer(tx, body, auth.adminId);
  });
  
  return new Response(JSON.stringify(result), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('GET', '/customers/:id', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR'] }, async (req, url, params) => {
  const sql = getDb();
  const result = await AdminCustomerService.getCustomer(sql, params.id);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('PUT', '/customers/:id', { roles: ['OWNER', 'ADMIN', 'FINANCE'], requireMfa: true }, async (req, url, params) => {
  const auth = (req as any).adminAuth;
  const body = await req.json();
  const sql = getDb();
  
  const result = await sql.begin(async (tx) => {
    return await AdminCustomerService.updateCustomer(tx, params.id, body, auth.adminId);
  });
  
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});


// --- Licenses ---
router.add('GET', '/licenses', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR'] }, async (req) => {
  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  
  const sql = getDb();
  const result = await AdminLicenseService.listLicenses(sql, search, limit, offset);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('POST', '/licenses', { roles: ['OWNER', 'ADMIN', 'FINANCE'], requireMfa: true }, async (req) => {
  const auth = (req as any).adminAuth;
  const body = await req.json();
  const sql = getDb();
  
  const result = await sql.begin(async (tx) => {
    return await AdminLicenseService.createLicense(tx, body, auth.adminId);
  });
  
  return new Response(JSON.stringify(result), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('GET', '/licenses/:id', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR'] }, async (req, url, params) => {
  const sql = getDb();
  const result = await AdminLicenseService.getLicense(sql, params.id);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// --- Devices ---
router.add('GET', '/devices', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'AUDITOR'] }, async (req) => {
  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const sql = getDb();
  const result = await AdminDeviceService.listDevices(sql, search, limit, offset);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('GET', '/devices/:id', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'AUDITOR'] }, async (req, url, params) => {
  const sql = getDb();
  const result = await AdminDeviceService.getDevice(sql, params.id);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// --- Check-ins ---
router.add('GET', '/checkins', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'AUDITOR'] }, async (req) => {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const sql = getDb();
  const result = await AdminCheckinService.listCheckins(sql, limit, offset);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('GET', '/bindings/:id/checkin', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'AUDITOR'] }, async (req, url, params) => {
  const sql = getDb();
  const result = await AdminCheckinService.getBindingCheckinStatus(sql, params.id);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// --- Directives ---
router.add('GET', '/directives', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'AUDITOR'] }, async (req) => {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const sql = getDb();
  const result = await AdminDirectiveService.listDirectives(sql, limit, offset);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('POST', '/directives', { roles: ['OWNER', 'ADMIN', 'SUPPORT'], requireMfa: true }, async (req) => {
  const auth = (req as any).adminAuth;
  const body = await req.json();
  const sql = getDb();
  const result = await sql.begin(async (tx) => {
    return await AdminDirectiveService.createDirective(tx, body, auth.adminId);
  });
  return new Response(JSON.stringify(result), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('POST', '/directives/:id/cancel', { roles: ['OWNER', 'ADMIN', 'SUPPORT'], requireMfa: true }, async (req, url, params) => {
  const auth = (req as any).adminAuth;
  const sql = getDb();
  const result = await sql.begin(async (tx) => {
    return await AdminDirectiveService.cancelDirective(tx, params.id, auth.adminId);
  });
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// --- Audit ---
router.add('GET', '/audit', { roles: ['OWNER', 'ADMIN', 'AUDITOR'] }, async (req) => {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const sql = getDb();
  const result = await AdminAuditService.listEvents(sql, limit, offset);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// --- Dashboard ---
router.add('GET', '/dashboard/summary', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR'] }, async (req) => {
  const sql = getDb();
  const result = await AdminDashboardService.getSummary(sql);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// --- Legacy Lifecycle mappings for backward compatibility with integration tests ---
// Tests use /admin/lifecycle/release-binding but we use /v1/admin/lifecycle/release-binding in Edge Functions
router.add('POST', '/lifecycle/release-binding', { roles: ['OWNER', 'ADMIN', 'SUPPORT', 'SYSTEM'], requireMfa: true }, async (req) => {
  const auth = (req as any).adminAuth;
  const body = await req.json();
  const sql = getDb();
  const { licenseId, deviceKeyId, reason } = body;
  if (!licenseId || !deviceKeyId || !reason) throw new Error('INVALID_REQUEST');
  
  await sql.begin(async (tx) => {
    await AdminLifecycleService.releaseBinding(tx, auth.adminId, licenseId, deviceKeyId, reason);
  });
  return new Response(JSON.stringify({ status: 'SUCCESS' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('POST', '/lifecycle/revoke-license', { roles: ['OWNER', 'ADMIN', 'SYSTEM'], requireMfa: true }, async (req) => {
  const auth = (req as any).adminAuth;
  const body = await req.json();
  const sql = getDb();
  const { licenseId, reason } = body;
  if (!licenseId || !reason) throw new Error('INVALID_REQUEST');
  
  await sql.begin(async (tx) => {
    await AdminLifecycleService.revokeLicense(tx, auth.adminId, licenseId, reason);
  });
  return new Response(JSON.stringify({ status: 'SUCCESS' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('POST', '/lifecycle/restore-license', { roles: ['OWNER', 'ADMIN', 'SYSTEM'], requireMfa: true }, async (req) => {
  const auth = (req as any).adminAuth;
  const body = await req.json();
  const sql = getDb();
  const { licenseId, reason } = body;
  if (!licenseId || !reason) throw new Error('INVALID_REQUEST');
  
  await sql.begin(async (tx) => {
    await AdminLifecycleService.restoreLicense(tx, auth.adminId, licenseId, reason);
  });
  return new Response(JSON.stringify({ status: 'SUCCESS' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('POST', '/lifecycle/disable-license', { roles: ['OWNER', 'ADMIN', 'SYSTEM'], requireMfa: true }, async (req) => {
  const auth = (req as any).adminAuth;
  const body = await req.json();
  const sql = getDb();
  const { licenseId, reason } = body;
  if (!licenseId || !reason) throw new Error('INVALID_REQUEST');
  
  await sql.begin(async (tx) => {
    await AdminLifecycleService.disableLicense(tx, auth.adminId, licenseId, reason);
  });
  return new Response(JSON.stringify({ status: 'SUCCESS' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

router.add('POST', '/lifecycle/extend-license', { roles: ['OWNER', 'ADMIN', 'SYSTEM'], requireMfa: true }, async (req) => {
  const auth = (req as any).adminAuth;
  const body = await req.json();
  const sql = getDb();
  const { licenseId, valid_until, reason } = body;
  if (!licenseId || !valid_until || !reason) throw new Error('INVALID_REQUEST');
  
  await sql.begin(async (tx) => {
    await AdminLifecycleService.extendLicense(tx, auth.adminId, licenseId, valid_until, reason);
  });
  return new Response(JSON.stringify({ status: 'SUCCESS' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

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
    if (err instanceof AdminLifecycleError) {
      return new Response(JSON.stringify({ error: err.code, message: err.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (err.name === 'ZodError') {
       return new Response(JSON.stringify({ error: 'VALIDATION_ERROR', message: err.errors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (err.message === 'CUSTOMER_NOT_FOUND' || err.message === 'LICENSE_NOT_FOUND') {
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
