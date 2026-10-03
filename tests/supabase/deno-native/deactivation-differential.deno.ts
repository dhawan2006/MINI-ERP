import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import crypto from "node:crypto";
import { hashLicenseKey } from "../../../supabase/functions/_shared/crypto/licenseKey.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const LOCAL_HMAC_SECRET = "test-hmac-secret-32-chars-min-must-be-long-enough!";
const HOSTED_HMAC_SECRET = "ac2ba941bdb735215819756a3145d1f79f03709639e61d9dde35c3fdd16886ca";

const FIXTURES = {
  valid: { id: crypto.randomUUID(), key: "test-deact-valid", max: 1 },
  no_binding: { id: crypto.randomUUID(), key: "test-deact-nobind", max: 1 },
};

const TARGETS = [
  { name: "Node Reference", url: "http://localhost:3000/api/v1/lifecycle/deactivation", isHosted: false },
  { name: "Supabase Local", url: "http://localhost:54321/functions/v1/deactivate", isHosted: false },
  { name: "Supabase Hosted QA", url: "https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1/deactivate", isHosted: true }
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
    deviceKeyId: "dev-" + crypto.randomUUID(),
    publicKeyRaw: ecdh.getPublicKey(),
    publicKeyBase64url: Buffer.from(ecdh.getPublicKey()).toString('base64url'),
    privateKeyRaw: ecdh.getPrivateKey()
  };
}

async function setupDatabase(isHosted: boolean) {
  const deletes = `
    DELETE FROM audit_events;
    DELETE FROM license_bindings;
    DELETE FROM activation_requests;
    DELETE FROM lifecycle_requests;
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
      VALUES ('${f.id}', 'mini-pos-v1', '${hmac}', ${f.max}, 'ACTIVE', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 year');
    `;
  }
  await executeSql(inserts, isHosted);
}

async function testTarget(target: any) {
  console.log(`\n============================================================\nTESTING TARGET: ${target.name}\n============================================================\n`);
  
  await setupDatabase(target.isHosted);
  
  // 1. Setup Active Binding
  const client = await generateClient();
  const insertDeviceAndBinding = `
    INSERT INTO devices (device_key_id, public_key, last_seen_at) VALUES ('${client.deviceKeyId}', '${client.publicKeyBase64url}', NOW());
    INSERT INTO license_bindings (license_id, device_key_id, status, activated_at) VALUES ('${FIXTURES.valid.id}', '${client.deviceKeyId}', 'ACTIVE', NOW());
  `;
  await executeSql(insertDeviceAndBinding, target.isHosted);

  // 2. Fetch Challenge
  const chalRes = await fetch(`${target.url}/challenge`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceKeyId: client.deviceKeyId, licenseId: FIXTURES.valid.id })
  });
  const challengeText = await chalRes.text();
  assertEquals(chalRes.status, 200, `Challenge fetch failed on ${target.name}: ${challengeText}`);
  const challenge = JSON.parse(challengeText);
  assertEquals(challenge.purpose, "DEACTIVATION");
  
  // 3. Create Proof
  const signature = await sign(challenge, client.publicKeyRaw, client.privateKeyRaw);
  const proof = { challenge, signature };
  
  // 4. Successful Deactivation
  const requestId = crypto.randomUUID();
  const payload = {
    requestId,
    licenseId: FIXTURES.valid.id,
    deviceKeyId: client.deviceKeyId,
    proof
  };
  
  const deactRes = await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  
  assertEquals(deactRes.status, 200, `Deactivation failed on ${target.name}`);
  const deactBody = await deactRes.json();
  assertEquals(deactBody.status, "DEACTIVATED");
  assertExists(deactBody.timestamp);
  console.log(`  [Pass] Successful Deactivation`);

  // 5. Idempotency (Same Request ID, Same Payload)
  const idempRes = await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assertEquals(idempRes.status, 200);
  const idempBody = await idempRes.json();
  assertEquals(idempBody.status, deactBody.status);
  assertEquals(idempBody.timestamp, deactBody.timestamp); // EXACT match from cache
  console.log(`  [Pass] Idempotency (Same Request ID, Same Payload)`);

  // 6. Conflict (Same Request ID, Different Payload)
  const conflictPayload = { ...payload, licenseId: FIXTURES.no_binding.id };
  const conflictRes = await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conflictPayload)
  });
  assertEquals(conflictRes.status, 409);
  const conflictBody = await conflictRes.json();
  assertEquals(conflictBody.error, "LIFECYCLE_REQUEST_CONFLICT");
  console.log(`  [Pass] Request Conflict (Same Request ID, Different Payload)`);

  // 7. Already Deactivated
  const newReqId = crypto.randomUUID();
  const chalRes2 = await fetch(`${target.url}/challenge`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceKeyId: client.deviceKeyId, licenseId: FIXTURES.valid.id })
  });
  const challenge2 = await chalRes2.json();
  const signature2 = await sign(challenge2, client.publicKeyRaw, client.privateKeyRaw);
  
  const alreadyRes = await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: newReqId,
      licenseId: FIXTURES.valid.id,
      deviceKeyId: client.deviceKeyId,
      proof: { challenge: challenge2, signature: signature2 }
    })
  });
  assertEquals(alreadyRes.status, 400);
  const alreadyBody = await alreadyRes.json();
  assertEquals(alreadyBody.error, "ALREADY_DEACTIVATED");
  console.log(`  [Pass] Already Deactivated -> ALREADY_DEACTIVATED`);

  // 8. No Binding Found
  const client3 = await generateClient();
  await executeSql(`INSERT INTO devices (device_key_id, public_key, last_seen_at) VALUES ('${client3.deviceKeyId}', '${client3.publicKeyBase64url}', NOW());`, target.isHosted);
  
  const chalRes3 = await fetch(`${target.url}/challenge`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceKeyId: client3.deviceKeyId, licenseId: FIXTURES.no_binding.id })
  });
  const challenge3 = await chalRes3.json();
  const signature3 = await sign(challenge3, client3.publicKeyRaw, client3.privateKeyRaw);
  
  const noBindRes = await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      licenseId: FIXTURES.no_binding.id, // No binding exists for this license
      deviceKeyId: client3.deviceKeyId,
      proof: { challenge: challenge3, signature: signature3 }
    })
  });
  assertEquals(noBindRes.status, 400);
  const noBindBody = await noBindRes.json();
  assertEquals(noBindBody.error, "BINDING_NOT_FOUND");
  console.log(`  [Pass] No Binding Found -> BINDING_NOT_FOUND`);
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
  console.log("\nALL DIFFERENTIAL TESTS PASSED");
  Deno.exit(0);
}

run();
