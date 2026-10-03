import { assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import crypto from "node:crypto";
import { hashLicenseKey } from "../../../supabase/functions/_shared/crypto/licenseKey.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const LOCAL_HMAC_SECRET = "test-hmac-secret-32-chars-min-must-be-long-enough!";
const HOSTED_HMAC_SECRET = "ac2ba941bdb735215819756a3145d1f79f03709639e61d9dde35c3fdd16886ca";

const ADMIN_TOKEN_DEV = "12345678901234567890123456789012";
const ADMIN_TOKEN_QA = "c32eabe8e7188d321bbe88c864ef41e6ca2d475f69b01fe16af70de91070eeef";

const TARGETS = [
  { name: "Node Reference", url: "http://localhost:3000/api/v1", isHosted: false, adminToken: ADMIN_TOKEN_DEV },
  { name: "Supabase Local", url: "http://localhost:54321/functions/v1", isHosted: false, adminToken: ADMIN_TOKEN_DEV },
  { name: "Supabase Hosted QA", url: "https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1", isHosted: true, adminToken: ADMIN_TOKEN_QA }
];

const localSql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

async function executeSql(sqlStr: string, isHosted: boolean) {
  if (!isHosted) {
    await localSql.unsafe(sqlStr);
  } else {
    const p = new Deno.Command("npx", {
      args: ["supabase", "db", "query", "--linked", sqlStr],
      stdout: "piped",
      stderr: "piped"
    });
    const { code, stderr } = await p.output();
    if (code !== 0) throw new Error("DB Query failed: " + new TextDecoder().decode(stderr));
  }
}

async function fetchAdmin(target: any, path: string, payload: any, tokenOverride?: string) {
  const token = tokenOverride !== undefined ? tokenOverride : target.adminToken;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${target.url}/admin/lifecycle/${path}`, {
    method: "POST", headers,
    body: JSON.stringify(payload)
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { status: res.status, body };
}

async function setupDatabase(isHosted: boolean) {
  const deletes = `
    DELETE FROM audit_events;
    DELETE FROM license_bindings;
    DELETE FROM licenses;
  `;
  await executeSql(deletes, isHosted);
}

async function createLicense(isHosted: boolean, maxDevices: number) {
  const keyStr = "test-key-" + crypto.randomUUID().slice(0,8);
  const secret = isHosted ? HOSTED_HMAC_SECRET : LOCAL_HMAC_SECRET;
  const hmac = await hashLicenseKey(keyStr, secret);
  const id = crypto.randomUUID();
  await executeSql(`
    INSERT INTO licenses (id, product_id, license_key_hmac, max_devices, status, valid_from, valid_until)
    VALUES ('${id}', 'mini-pos-v1', '${hmac}', ${maxDevices}, 'ACTIVE', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 year');
  `, isHosted);
  return { id, keyStr };
}

async function createBinding(isHosted: boolean, licenseId: string, deviceKeyId: string) {
  const id = crypto.randomUUID();
  await executeSql(`
    INSERT INTO devices (device_key_id, public_key, last_seen_at)
    VALUES ('${deviceKeyId}', 'dummy-key', NOW())
    ON CONFLICT (device_key_id) DO NOTHING;
    INSERT INTO license_bindings (id, license_id, device_key_id, status)
    VALUES ('${id}', '${licenseId}', '${deviceKeyId}', 'ACTIVE');
  `, isHosted);
  return id;
}

async function testTarget(target: any) {
  console.log(`\n============================================================\nTESTING TARGET: ${target.name}\n============================================================\n`);
  
  await setupDatabase(target.isHosted);
  
  console.log(`--- SECTION 1: AUTHENTICATION ---`);
  const licenseAuth = await createLicense(target.isHosted, 1);
  const resAuthMissing = await fetchAdmin(target, "revoke-license", { licenseId: licenseAuth.id, reason: "test" }, null);
  assertEquals(resAuthMissing.status, 401);
  assertEquals(resAuthMissing.body.error, "LIFECYCLE_ADMIN_UNAUTHORIZED");
  
  const resAuthWrong = await fetchAdmin(target, "revoke-license", { licenseId: licenseAuth.id, reason: "test" }, "wrong-token-1234567890123456789012345678");
  assertEquals(resAuthWrong.status, 401);
  assertEquals(resAuthWrong.body.error, "LIFECYCLE_ADMIN_UNAUTHORIZED");

  console.log(`[PASS] Section 1 - Authentication`);

  console.log(`--- SECTION 2: RELEASE BINDING ---`);
  const licenseRel = await createLicense(target.isHosted, 2);
  const devKey1 = "dev-" + crypto.randomUUID();
  await createBinding(target.isHosted, licenseRel.id, devKey1);

  // Release it
  const rel1 = await fetchAdmin(target, "release-binding", { licenseId: licenseRel.id, deviceKeyId: devKey1, reason: "user requested" });
  assertEquals(rel1.status, 200);
  assertEquals(rel1.body.status, "SUCCESS");

  // Release it again
  const rel2 = await fetchAdmin(target, "release-binding", { licenseId: licenseRel.id, deviceKeyId: devKey1, reason: "user requested again" });
  assertEquals(rel2.status, 400);
  assertEquals(rel2.body.error, "ALREADY_DEACTIVATED");

  // Release non-existent binding
  const rel3 = await fetchAdmin(target, "release-binding", { licenseId: licenseRel.id, deviceKeyId: "dev-not-exist", reason: "test" });
  assertEquals(rel3.status, 400);
  assertEquals(rel3.body.error, "BINDING_NOT_FOUND");
  console.log(`[PASS] Section 2 - Release Binding`);

  console.log(`--- SECTION 3: REVOKE LICENSE ---`);
  const licenseRev = await createLicense(target.isHosted, 2);
  const devKeyRev = "dev-" + crypto.randomUUID();
  await createBinding(target.isHosted, licenseRev.id, devKeyRev);

  const rev1 = await fetchAdmin(target, "revoke-license", { licenseId: licenseRev.id, reason: "payment failed" });
  assertEquals(rev1.status, 200);
  assertEquals(rev1.body.status, "SUCCESS");

  const rev2 = await fetchAdmin(target, "revoke-license", { licenseId: licenseRev.id, reason: "payment failed again" });
  assertEquals(rev2.status, 400);
  assertEquals(rev2.body.error, "ALREADY_REVOKED");

  // Test that binding is deactivated - trying to release it should return ALREADY_DEACTIVATED
  const revRel = await fetchAdmin(target, "release-binding", { licenseId: licenseRev.id, deviceKeyId: devKeyRev, reason: "test" });
  assertEquals(revRel.status, 400);
  assertEquals(revRel.body.error, "ALREADY_DEACTIVATED");
  console.log(`[PASS] Section 3 - Revoke License`);

  console.log(`--- SECTION 4: RESTORE LICENSE ---`);
  // Try restore when already ACTIVE
  const res1 = await fetchAdmin(target, "restore-license", { licenseId: licenseRel.id, reason: "mistake" });
  assertEquals(res1.status, 400);
  assertEquals(res1.body.error, "INVALID_STATE");

  // Restore the revoked license
  const res2 = await fetchAdmin(target, "restore-license", { licenseId: licenseRev.id, reason: "payment successful" });
  assertEquals(res2.status, 200);
  assertEquals(res2.body.status, "SUCCESS");

  // Revoke it again just to be sure state flipped
  const res3 = await fetchAdmin(target, "revoke-license", { licenseId: licenseRev.id, reason: "payment failed" });
  assertEquals(res3.status, 200);

  console.log(`[PASS] Section 4 - Restore License`);
}

async function run() {
  for (const target of TARGETS) {
    try {
      await testTarget(target);
    } catch (e) {
      console.error(`TEST FAILED ON TARGET ${target.name}`, e);
      Deno.exit(1);
    }
  }
  console.log("\nALL ADMIN DIFFERENTIAL TESTS PASSED");
  Deno.exit(0);
}

run();
