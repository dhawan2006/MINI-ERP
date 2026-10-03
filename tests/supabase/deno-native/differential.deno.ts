import { assertEquals, assertExists, assertMatch, assertObjectMatch } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { hashLicenseKey } from "../../../supabase/functions/_shared/crypto/licenseKey.ts";
import crypto from "node:crypto";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

// Test Targets
const TARGETS = [
  { name: "Supabase Hosted QA", url: "https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1/activate", isHosted: true }
];

const LOCAL_HMAC_SECRET = "test-hmac-secret-32-chars-min-must-be-long-enough!";
const HOSTED_HMAC_SECRET = "ac2ba941bdb735215819756a3145d1f79f03709639e61d9dde35c3fdd16886ca";

const FIXTURES = {
  valid: { id: "10000000-0000-0000-0000-000000000001", key: "test-valid-license", max: 5, status: 'ACTIVE', from: "NOW() - INTERVAL '1 day'", until: "NOW() + INTERVAL '1 year'" },
  expired: { id: "10000000-0000-0000-0000-000000000002", key: "test-expired-license", max: 5, status: 'ACTIVE', from: "NOW() - INTERVAL '2 year'", until: "NOW() - INTERVAL '1 day'" },
  revoked: { id: "10000000-0000-0000-0000-000000000003", key: "test-revoked-license", max: 5, status: 'REVOKED', from: "NOW() - INTERVAL '1 day'", until: "NOW() + INTERVAL '1 year'" },
  disabled: { id: "10000000-0000-0000-0000-000000000004", key: "test-disabled-license", max: 5, status: 'DISABLED', from: "NOW() - INTERVAL '1 day'", until: "NOW() + INTERVAL '1 year'" },
  capacity: { id: "10000000-0000-0000-0000-000000000005", key: "test-capacity-license", max: 1, status: 'ACTIVE', from: "NOW() - INTERVAL '1 day'", until: "NOW() + INTERVAL '1 year'" },
};

async function executeSql(sqlStmt: string, isHosted: boolean) {
  if (isHosted) {
    const command = new Deno.Command("npx", {
      args: ["supabase", "db", "query", "--linked", sqlStmt],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await command.output();
    if (!output.success) throw new Error(`Query failed: ${new TextDecoder().decode(output.stderr)}`);
  } else {
    const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    try {
      await sql.unsafe(sqlStmt);
    } finally {
      await sql.end();
    }
  }
}

async function setupDatabase(isHosted: boolean) {
  let deletes = `
    DELETE FROM runtime_directive_deliveries;
    DELETE FROM runtime_directives;
    DELETE FROM runtime_checkins;
    DELETE FROM runtime_checkin_requests;
    DELETE FROM audit_events;
    DELETE FROM license_bindings;
    DELETE FROM activation_requests;
    DELETE FROM device_challenges;
    DELETE FROM devices;
    DELETE FROM licenses;
  `;
  await executeSql(deletes, isHosted);

  let inserts = "";
  const secret = isHosted ? HOSTED_HMAC_SECRET : LOCAL_HMAC_SECRET;
  for (const f of Object.values(FIXTURES)) {
    const hmac = await hashLicenseKey(f.key, secret);
    inserts += `
      INSERT INTO licenses (id, product_id, license_key_hmac, max_devices, status, valid_from, valid_until)
      VALUES ('${f.id}', 'mini-pos-v1', '${hmac}', ${f.max}, '${f.status}', ${f.from}, ${f.until});
    `;
  }
  
  // Seed a capacity license binding
  inserts += `
    INSERT INTO devices (device_key_id, public_key) VALUES ('capacity-device-bound', 'dummy-pubkey');
    INSERT INTO license_bindings (id, license_id, device_key_id, status) VALUES ('10000000-0000-0000-0000-000000000200', '${FIXTURES.capacity.id}', 'capacity-device-bound', 'ACTIVE');
  `;

  await executeSql(inserts, isHosted);
}

async function sign(challenge: any, publicKeyRaw: Buffer, privateKeyRaw: Buffer) {
  const { canonicalize } = await import("../../../supabase/functions/_shared/crypto/canonicalize.ts");
  const canonicalBytes = Buffer.from(canonicalize(challenge), 'utf8');
  const domainTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
  const dataToSign = Buffer.concat([domainTag, canonicalBytes]);
  const p256Header = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex");
  const spki = Buffer.concat([p256Header, publicKeyRaw]);
  const privPem = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420", "hex"), privateKeyRaw]), format: 'der', type: 'pkcs8' });
  const signObj = crypto.createSign('SHA256');
  signObj.update(dataToSign);
  return signObj.sign(privPem).toString('base64url');
}

async function generateClient() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    deviceKeyId: "device-" + crypto.randomUUID(),
    publicKeyRaw: ecdh.getPublicKey(),
    publicKeyBase64url: Buffer.from(ecdh.getPublicKey()).toString('base64url'),
    privateKeyRaw: ecdh.getPrivateKey()
  };
}

async function testTarget(target: any) {
  console.log(`\n\n============================================================`);
  console.log(`TESTING TARGET: ${target.name}`);
  console.log(`============================================================\n`);

  await setupDatabase(target.isHosted);

  const client = await generateClient();

  // 1. CHALLENGE DIFFERENTIAL
  let res = await fetch(`${target.url}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceKeyId: client.deviceKeyId })
  });
  assertEquals(res.status, 200);
  const challenge = await res.json();
  assertExists(challenge.challengeId);
  assertEquals(challenge.protocolVersion, 1);
  assertEquals(challenge.purpose, "ACTIVATION");
  assertEquals(challenge.deviceKeyId, client.deviceKeyId);
  
  // 2. SUCCESSFUL ACTIVATION
  const signature = await sign(challenge, client.publicKeyRaw, client.privateKeyRaw);
  const requestId = crypto.randomUUID();
  let payload = {
    requestId,
    licenseKey: FIXTURES.valid.key,
    deviceKeyId: client.deviceKeyId,
    publicKey: client.publicKeyBase64url,
    deviceProof: { challenge, signature }
  };
  
  res = await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  assertEquals(res.status, 200, `Success failed on ${target.name}`);
  let responseBody = await res.json();
  assertEquals(responseBody.status, "SUCCESS");
  assertExists(responseBody.payload.authorization);
  
  // 3. IDEMPOTENCY
  // Same requestId, same payload -> success
  res = await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  assertEquals(res.status, 200);
  let idempBody = await res.json();
  assertEquals(idempBody.status, "SUCCESS");
  // The authorization JWT must be exactly identical
  assertEquals(idempBody.payload.authorization, responseBody.payload.authorization);

  // Same requestId, DIFFERENT payload -> conflict
  payload.licenseKey = FIXTURES.expired.key;
  res = await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  assertEquals(res.status, 409);
  let conflictBody = await res.json();
  assertEquals(conflictBody.error, "ACTIVATION_REQUEST_CONFLICT");

  // 4. ERROR DIFFERENTIAL MATRIX
  const matrix = [
    { name: "Nonexistent License", key: "invalid-key", expectedError: "LICENSE_NOT_FOUND" },
    { name: "Expired License", key: FIXTURES.expired.key, expectedError: "LICENSE_EXPIRED" },
    { name: "Revoked License", key: FIXTURES.revoked.key, expectedError: "LICENSE_REVOKED" },
    { name: "Disabled License", key: FIXTURES.disabled.key, expectedError: "LICENSE_DISABLED" },
    { name: "Device Capacity Exceeded", key: FIXTURES.capacity.key, expectedError: "DEVICE_LIMIT_REACHED" },
  ];

  for (const tc of matrix) {
    const cClient = await generateClient();
    const cRes = await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: cClient.deviceKeyId }) });
    const cChal = await cRes.json();
    const cSig = await sign(cChal, cClient.publicKeyRaw, cClient.privateKeyRaw);
    
    const r = await fetch(target.url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        licenseKey: tc.key,
        deviceKeyId: cClient.deviceKeyId,
        publicKey: cClient.publicKeyBase64url,
        deviceProof: { challenge: cChal, signature: cSig }
      })
    });
    const errorBody = await r.json();
    assertEquals(r.status, tc.expectedError === "ACTIVATION_REQUEST_CONFLICT" ? 409 : 400);
    assertEquals(errorBody.error, tc.expectedError);
    console.log(`  [Pass] ${tc.name} -> ${tc.expectedError}`);
  }

  // 5. SEAMLESS RENEWAL
  // Attempt to activate again with a new challenge on the SAME license + device
  const cRes2 = await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: client.deviceKeyId }) });
  const cChal2 = await cRes2.json();
  const cSig2 = await sign(cChal2, client.publicKeyRaw, client.privateKeyRaw);
  
  res = await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      licenseKey: FIXTURES.valid.key,
      deviceKeyId: client.deviceKeyId,
      publicKey: client.publicKeyBase64url,
      deviceProof: { challenge: cChal2, signature: cSig2 }
    })
  });
  assertEquals(res.status, 200, `Seamless renewal failed on ${target.name}`);
  let renBody = await res.json();
  assertEquals(renBody.status, "SUCCESS");

  // Invalid signature test
  const badSigClient = await generateClient();
  const badChalRes = await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: badSigClient.deviceKeyId }) });
  const badChal = await badChalRes.json();
  const badSig = await sign(badChal, badSigClient.publicKeyRaw, client.privateKeyRaw); // Signed with wrong key!
  
  res = await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      licenseKey: FIXTURES.valid.key,
      deviceKeyId: badSigClient.deviceKeyId,
      publicKey: badSigClient.publicKeyBase64url,
      deviceProof: { challenge: badChal, signature: badSig }
    })
  });
  let badBody = await res.json();
  assertEquals(badBody.error, "DEVICE_PROOF_INVALID");
}

async function run() {
  for (const target of TARGETS) {
    try {
      await testTarget(target);
    } catch(e) {
      console.error(`TEST FAILED ON TARGET ${target.name}`, e);
      Deno.exit(1);
    }
  }
  console.log("\nALL DIFFERENTIAL TESTS PASSED");
  Deno.exit(0);
}

run();
