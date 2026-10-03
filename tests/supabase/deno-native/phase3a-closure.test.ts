import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "dummy";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ADMIN_URL = `${SUPABASE_URL}/functions/v1/admin`;

let users: Record<string, string> = {};
let results: any[] = [];

function recordResult(testName: string, passed: boolean, details: string = '') {
  results.push({ testName, passed, details });
  if (passed) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName} - ${details}`);
  }
}

async function apiCall(token: string | null, method: string, path: string, body?: any, reqId?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (reqId) headers['X-Idempotency-Key'] = reqId;

  const res = await fetch(`${ADMIN_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch(e) {}
  return { status: res.status, json, text };
}

async function createTestUser(email: string, role: string | null) {
  const { data: { user }, error: signupError } = await adminClient.auth.admin.createUser({
    email,
    password: 'Password123!',
    email_confirm: true
  });
  let userId = user?.id;
  if (!userId) {
    const res = await adminClient.from('users').select('id').eq('email', email).single();
    if (res.data) userId = res.data.id;
  }
  
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password: 'Password123!'
  });
  if (signInError) throw new Error(`Failed to sign in ${email}: ${signInError.message}`);
  userId = signInData.user.id;

  if (role) {
    await adminClient.from('admin_roles').upsert({ admin_id: userId, role: role });
  } else {
    await adminClient.from('admin_roles').delete().eq('admin_id', userId);
  }
  return { token: signInData.session.access_token, id: userId };
}

async function setup() {
  console.log("Setting up test users...");
  const roles = ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR'];
  for (const role of roles) {
    const u = await createTestUser(`test_${role.toLowerCase()}@example.com`, role);
    users[role] = u.token;
  }
  const none = await createTestUser(`test_none@example.com`, null);
  users['NONE'] = none.token;
}

async function runRoleMatrix() {
  console.log("\\n--- 1. ROLE MATRIX ---");
  const endpoints = [
    { name: 'GET customers', method: 'GET', path: '/customers', body: null, roles: ['OWNER','ADMIN','SUPPORT','FINANCE','AUDITOR'] },
    { name: 'POST customers', method: 'POST', path: '/customers', body: { business_name: 'Matrix' }, roles: ['OWNER','ADMIN','FINANCE'] },
    { name: 'GET licenses', method: 'GET', path: '/licenses', body: null, roles: ['OWNER','ADMIN','SUPPORT','FINANCE','AUDITOR'] },
    { name: 'POST license', method: 'POST', path: '/licenses', body: { product_id: 'prod_1', max_devices: 5, valid_until: '2030-01-01T00:00:00Z' }, roles: ['OWNER','ADMIN','FINANCE'] },
    { name: 'extend license', method: 'POST', path: '/lifecycle/extend-license', body: { licenseId: '00000000-0000-0000-0000-000000000000', valid_until: '2031-01-01T00:00:00Z', reason: 'Test' }, roles: ['OWNER','ADMIN'] },
    { name: 'disable license', method: 'POST', path: '/lifecycle/disable-license', body: { licenseId: '00000000-0000-0000-0000-000000000000', reason: 'Test' }, roles: ['OWNER','ADMIN'] },
    { name: 'restore license', method: 'POST', path: '/lifecycle/restore-license', body: { licenseId: '00000000-0000-0000-0000-000000000000', reason: 'Test' }, roles: ['OWNER','ADMIN'] },
    { name: 'revoke license', method: 'POST', path: '/lifecycle/revoke-license', body: { licenseId: '00000000-0000-0000-0000-000000000000', reason: 'Test' }, roles: ['OWNER','ADMIN'] },
    { name: 'release binding', method: 'POST', path: '/lifecycle/release-binding', body: { licenseId: '00000000-0000-0000-0000-000000000000', deviceKeyId: 'dev_1', reason: 'Test' }, roles: ['OWNER','ADMIN','SUPPORT'] },
    { name: 'get devices', method: 'GET', path: '/devices', body: null, roles: ['OWNER','ADMIN','SUPPORT','AUDITOR'] },
    { name: 'get check-ins', method: 'GET', path: '/checkins', body: null, roles: ['OWNER','ADMIN','SUPPORT','AUDITOR'] },
    { name: 'create directive', method: 'POST', path: '/directives', body: { target_binding_id: '00000000-0000-0000-0000-000000000000', type: 'DISPLAY_MESSAGE' }, roles: ['OWNER','ADMIN','SUPPORT'] },
    { name: 'cancel directive', method: 'POST', path: '/directives/00000000-0000-0000-0000-000000000000/cancel', body: null, roles: ['OWNER','ADMIN','SUPPORT'] },
    { name: 'read audit logs', method: 'GET', path: '/audit', body: null, roles: ['OWNER','ADMIN','AUDITOR'] },
  ];

  const testRoles = ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR', 'NONE'];

  for (const ep of endpoints) {
    for (const role of testRoles) {
      const allowed = ep.roles.includes(role);
      const res = await apiCall(users[role], ep.method, ep.path, ep.body);
      
      let passed = false;
      if (allowed) {
        // Since we pass fake IDs, we expect 404 or 400 or 20x, but NOT 403.
        // Wait, MFA makes OWNER/ADMIN fail with 403 on mutations!
        if (['OWNER', 'ADMIN'].includes(role) && ep.method === 'POST') {
          passed = res.status === 403 && res.json?.error === 'MFA_REQUIRED';
        } else {
          passed = res.status !== 403 && res.status !== 401;
        }
      } else {
        passed = res.status === 403;
      }
      recordResult(`Role Matrix: ${role} -> ${ep.name}`, passed, `Expected allowed=${allowed}, got status ${res.status}`);
    }
    
    // Anonymous
    const anonRes = await apiCall(null, ep.method, ep.path, ep.body);
    recordResult(`Role Matrix: ANONYMOUS -> ${ep.name}`, anonRes.status === 401, `Expected 401, got ${anonRes.status}`);
  }
}

async function runMfaMatrix() {
  console.log("\\n--- 2. MFA MATRIX ---");
  // OWNER POST without AAL2 -> 403
  const resOwner1 = await apiCall(users['OWNER'], 'POST', '/customers', { business_name: 'Test' });
  recordResult(`MFA Matrix: OWNER AAL1 sensitive mutation`, resOwner1.status === 403 && resOwner1.json?.error === 'MFA_REQUIRED', `Got ${resOwner1.status}`);

  // OWNER GET without AAL2 -> 200
  const resOwner2 = await apiCall(users['OWNER'], 'GET', '/customers');
  recordResult(`MFA Matrix: OWNER AAL1 read operation`, resOwner2.status === 200, `Got ${resOwner2.status}`);

  // SUPPORT POST (allowed mutation for SUPPORT) -> Wait, SUPPORT can't POST customers. 
  // Let's use release binding which SUPPORT can do.
  const resSupport1 = await apiCall(users['SUPPORT'], 'POST', '/lifecycle/release-binding', { licenseId: '00000000-0000-0000-0000-000000000000', deviceKeyId: 'dev_1', reason: 'Test' });
  // Should not be MFA_REQUIRED, should be something like NOT_FOUND because AAL1 is enough
  recordResult(`MFA Matrix: SUPPORT AAL1 sensitive mutation`, resSupport1.status !== 403, `Got ${resSupport1.status}`);

  const resFinance = await apiCall(users['FINANCE'], 'POST', '/customers', { business_name: 'Test' });
  recordResult(`MFA Matrix: FINANCE AAL1 sensitive mutation`, resFinance.status === 201, `Got ${resFinance.status}`);
}

async function runIdorTesting() {
  console.log("\\n--- 3. IDOR TESTING ---");
  // The system relies on database constraints (e.g. binding checking licenseId + deviceKeyId) 
  // rather than client-supplied disjoint IDs.
  
  // Let's create actual entities.
  const cA = await apiCall(users['FINANCE'], 'POST', '/customers', { business_name: 'Customer A' });
  const cB = await apiCall(users['FINANCE'], 'POST', '/customers', { business_name: 'Customer B' });
  
  const custA = cA.json.customer;
  const custB = cB.json.customer;

  const lA = await apiCall(users['FINANCE'], 'POST', '/licenses', { product_id: 'prod_a', max_devices: 1, valid_until: '2030-01-01T00:00:00Z', customer_id: custA.id });
  const lB = await apiCall(users['FINANCE'], 'POST', '/licenses', { product_id: 'prod_b', max_devices: 1, valid_until: '2030-01-01T00:00:00Z', customer_id: custB.id });

  const licA = lA.json.license;
  const licB = lB.json.license;

  // We are testing whether passing mismatched IDs (e.g., license A and device B) fails.
  // Actually, we don't have a way to manually create devices through Admin API, they are created by check-ins.
  // We can just query `release-binding` with license A and device B. Since no binding exists, it returns BINDING_NOT_FOUND, not updating the wrong one.
  const res = await apiCall(users['SUPPORT'], 'POST', '/lifecycle/release-binding', { licenseId: licA.id, deviceKeyId: 'dev_b', reason: 'idor' });
  recordResult(`IDOR: A -> B binding mismatch`, res.status === 400 && res.json.error === 'BINDING_NOT_FOUND', `Got ${res.status} ${res.text}`);
}

async function runAuthFailureMatrix() {
  console.log("\\n--- 4. AUTHENTICATION FAILURE MATRIX ---");
  
  const res1 = await apiCall(null, 'GET', '/customers');
  recordResult(`Auth Failure: No token`, res1.status === 401, `Got ${res1.status}`);

  const res2 = await apiCall('Bearer invalid.token.jwt', 'GET', '/customers');
  recordResult(`Auth Failure: Malformed token`, res2.status === 401, `Got ${res2.status}`);
  
  // Valid non-admin token
  const res4 = await apiCall(users['NONE'], 'GET', '/customers');
  recordResult(`Auth Failure: Valid non-admin token`, res4.status === 403, `Got ${res4.status}`);
}

async function runIdempotency() {
  console.log("\\n--- 5. ADMIN REQUEST IDEMPOTENCY ---");
  const reqId = '11111111-2222-3333-4444-555555555555';
  
  // First request
  const payload1 = { business_name: 'Idempotent A' };
  const res1 = await apiCall(users['FINANCE'], 'POST', '/customers', payload1, reqId);
  recordResult(`Idempotency: Initial request`, res1.status === 201, `Got ${res1.status}`);

  // Second request - exact same
  const res2 = await apiCall(users['FINANCE'], 'POST', '/customers', payload1, reqId);
  recordResult(`Idempotency: Retry same payload`, res2.status === 201 && JSON.stringify(res1.json) === JSON.stringify(res2.json), `Got ${res2.status}`);

  // Third request - different payload
  const payload2 = { business_name: 'Idempotent B' };
  const res3 = await apiCall(users['FINANCE'], 'POST', '/customers', payload2, reqId);
  recordResult(`Idempotency: Retry different payload (conflict)`, res3.status === 409, `Got ${res3.status}`);
}

async function runConcurrency() {
  console.log("\\n--- 6. CONCURRENCY ---");
  // Two admins revoke same license
  const l = await apiCall(users['FINANCE'], 'POST', '/licenses', { product_id: 'prod_conc', max_devices: 1, valid_until: '2030-01-01T00:00:00Z' });
  const licId = l.json.license.id;

  // We can't easily use OWNER without MFA, so let's use SYSTEM token (ADMIN_API_TOKEN) for revoke.
  const [res1, res2] = await Promise.all([
    apiCall(process.env.ADMIN_API_TOKEN || 'test-admin-token', 'POST', '/lifecycle/revoke-license', { licenseId: licId, reason: '1' }),
    apiCall(process.env.ADMIN_API_TOKEN || 'test-admin-token', 'POST', '/lifecycle/revoke-license', { licenseId: licId, reason: '2' })
  ]);
  
  const oneSuccess = (res1.status === 200 && res2.status !== 200) || (res1.status !== 200 && res2.status === 200);
  recordResult(`Concurrency: Two admins revoke same license`, oneSuccess, `Res1: ${res1.status}, Res2: ${res2.status}`);
}

async function runAuditVerification() {
  console.log("\\n--- 8. AUDIT VERIFICATION ---");
  const res = await apiCall(users['AUDITOR'], 'GET', '/audit');
  recordResult(`Audit Verification: Log accessible`, res.status === 200, `Got ${res.status}`);
  
  if (res.status === 200) {
    const events = res.json.data;
    const hasCreate = events.some((e: any) => e.event_type === 'LICENSE_CREATED');
    recordResult(`Audit Verification: Mutation logged`, hasCreate, `Events found`);
  }
}

async function main() {
  try {
    await setup();
    await runRoleMatrix();
    await runMfaMatrix();
    await runIdorTesting();
    await runAuthFailureMatrix();
    await runIdempotency();
    await runConcurrency();
    await runAuditVerification();
    
    console.log("\\n--- SUMMARY ---");
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    console.log(`Passed: ${passed}/${total}`);
    
    // Save to a file for reporting
    const fs = require('fs');
    fs.writeFileSync('./local-qa-results.json', JSON.stringify(results, null, 2));
    
  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

main();
