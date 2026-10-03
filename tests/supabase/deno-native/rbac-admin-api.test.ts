import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "dummy";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_URL = `${SUPABASE_URL}/functions/v1/admin`;

async function createTestUser(email: string, role: string | null) {
  const { data: { user }, error: signupError } = await adminClient.auth.admin.createUser({
    email,
    password: 'Password123!',
    email_confirm: true
  });

  let userId = user?.id;

  if (signupError && signupError.message.includes('already registered')) {
    // Already exists
  }
  
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password: 'Password123!'
  });

  if (signInError) throw new Error(`Failed to sign in ${email}: ${signInError.message}`);
  userId = signInData.user.id;

  if (role) {
    await adminClient.from('admin_roles').upsert({
      admin_id: userId,
      role: role
    });
  } else {
    await adminClient.from('admin_roles').delete().eq('admin_id', userId);
  }

  return { token: signInData.session.access_token, id: userId };
}

let users: Record<string, string> = {};

async function apiCall(token: string, method: string, path: string, body?: any) {
  const res = await fetch(`${ADMIN_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.status;
}

function assertEq(actual: any, expected: any, msg: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${msg} (expected ${expected}, got ${actual})`);
  }
  console.log(`PASS: ${msg}`);
}

async function runTests() {
  console.log("Setting up users...");
  const roles = ['OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR'];
  for (const role of roles) {
    const u = await createTestUser(`test_${role.toLowerCase()}@example.com`, role);
    users[role] = u.token;
  }
  const none = await createTestUser(`test_none@example.com`, null);
  users['NONE'] = none.token;
  console.log("Setup complete!");

  // Test 1
  let status = await apiCall(users['NONE'], 'GET', '/customers');
  assertEq(status, 403, "Regular user should be denied");

  // Test 2
  status = await apiCall(users['SUPPORT'], 'GET', '/customers');
  assertEq(status, 200, "SUPPORT can list customers");

  // Test 3
  status = await apiCall(users['SUPPORT'], 'POST', '/customers', { business_name: 'Test' });
  assertEq(status, 403, "SUPPORT cannot create customers");

  // Test 4
  status = await apiCall(users['FINANCE'], 'POST', '/customers', { business_name: 'Test Finance' });
  assertEq(status, 201, "FINANCE can create customers (without MFA)");

  // Test 5
  status = await apiCall(users['OWNER'], 'POST', '/customers', { business_name: 'Test Owner' });
  assertEq(status, 403, "OWNER requires MFA for creation");

  // Test 6
  status = await apiCall(users['OWNER'], 'GET', '/customers');
  assertEq(status, 200, "OWNER can GET without MFA");
  
  console.log("All tests passed!");
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
