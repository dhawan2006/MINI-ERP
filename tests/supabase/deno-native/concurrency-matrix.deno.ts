import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { hashLicenseKey } from "../../../supabase/functions/_shared/crypto/licenseKey.ts";
import crypto from "node:crypto";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const HMAC_SECRET = "test-hmac-secret-32-chars-min-must-be-long-enough!";

const FIXTURES: Record<string, any> = {
  max1_a: { id: "20000000-0000-0000-0000-000000000001", key: "test-max1-a", max: 1 },
  max1_b: { id: "20000000-0000-0000-0000-000000000002", key: "test-max1-b", max: 1 },
  max2_a: { id: "20000000-0000-0000-0000-000000000003", key: "test-max2-a", max: 2 },
  renewal: { id: "20000000-0000-0000-0000-000000000004", key: "test-renewal", max: 5 },
};

// Add 10 distinct licenses for conflict test
for (let i = 0; i < 10; i++) {
  FIXTURES[`conflict_${i}`] = { id: `30000000-0000-0000-0000-0000000000${i.toString().padStart(2, '0')}`, key: `test-conflict-${i}`, max: 1 };
}

const TARGETS = [
  { name: "Node Reference", url: "http://localhost:3000/api/v1/activation" },
  { name: "Supabase Local", url: "http://localhost:54321/functions/v1/activate" }
];

const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 20 });

async function resetDb() {
  await sql`DELETE FROM audit_events`;
  await sql`DELETE FROM license_bindings`;
  await sql`DELETE FROM activation_requests`;
  await sql`DELETE FROM device_challenges`;
  await sql`DELETE FROM devices`;
  await sql`DELETE FROM licenses`;

  for (const f of Object.values(FIXTURES)) {
    const hmac = await hashLicenseKey(f.key, HMAC_SECRET);
    await sql`
      INSERT INTO licenses (id, product_id, license_key_hmac, max_devices, status, valid_from, valid_until)
      VALUES (${f.id}, 'mini-pos-v1', ${hmac}, ${f.max}, 'ACTIVE', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 year')
    `;
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

async function fireRequests(url: string, payloads: any[]) {
  const promises = payloads.map(p => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p)
  }).then(async r => {
    let body;
    try {
      body = await r.json();
    } catch {
      body = { error: 'RAW_RESPONSE', message: await r.text() };
    }
    return { status: r.status, body };
  }));
  return await Promise.all(promises);
}

async function runTests(target: any) {
  console.log(`\n=== TARGET: ${target.name} ===`);
  
  // 1. Same Challenge Concurrency
  console.log("1. Same Challenge Concurrency (50 workers)");
  await resetDb();
  const c1 = await generateClient();
  const chalRes1 = await (await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: c1.deviceKeyId }) })).json();
  const sig1 = await sign(chalRes1, c1.publicKeyRaw, c1.privateKeyRaw);
  const payloads1 = Array.from({ length: 50 }, () => ({
    requestId: crypto.randomUUID(),
    licenseKey: FIXTURES.max1_a.key,
    deviceKeyId: c1.deviceKeyId,
    publicKey: c1.publicKeyBase64url,
    deviceProof: { challenge: chalRes1, signature: sig1 }
  }));
  const res1 = await fireRequests(target.url, payloads1);
  const success1 = res1.filter(r => r.body.status === "SUCCESS");
  const consumed1 = res1.filter(r => r.body.error === "CHALLENGE_REPLAYED" || r.body.error === "DEVICE_PROOF_INVALID");
  assertEquals(success1.length, 1); // Exactly one consumption
  
  const chalCheck = await sql`SELECT status FROM device_challenges WHERE challenge_id = ${chalRes1.challengeId}`;
  assertEquals(chalCheck[0].status, 'CONSUMED');

  // 2. Same Request ID Concurrency
  console.log("2. Same Request ID Concurrency (50 workers)");
  await resetDb();
  const c2 = await generateClient();
  const chalRes2 = await (await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: c2.deviceKeyId }) })).json();
  const sig2 = await sign(chalRes2, c2.publicKeyRaw, c2.privateKeyRaw);
  const reqId2 = crypto.randomUUID();
  const payloads2 = Array.from({ length: 50 }, () => ({
    requestId: reqId2,
    licenseKey: FIXTURES.max1_a.key,
    deviceKeyId: c2.deviceKeyId,
    publicKey: c2.publicKeyBase64url,
    deviceProof: { challenge: chalRes2, signature: sig2 }
  }));
  const res2 = await fireRequests(target.url, payloads2);
  const success2 = res2.filter(r => r.body.status === "SUCCESS");
  assertEquals(success2.length, 50); // All succeed logically because they hit idempotent cache
  
  const bindings2 = await sql`SELECT * FROM license_bindings WHERE status = 'ACTIVE'`;
  assertEquals(bindings2.length, 1);
  const reqCheck = await sql`SELECT * FROM activation_requests WHERE request_id = ${reqId2}`;
  assertEquals(reqCheck.length, 1);

  // 3. Conflicting Request ID Concurrency
  console.log("3. Conflicting Request ID Concurrency (10 workers)");
  await resetDb();
  const c3 = await generateClient();
  const chalRes3 = await (await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: c3.deviceKeyId }) })).json();
  const sig3 = await sign(chalRes3, c3.publicKeyRaw, c3.privateKeyRaw);
  const reqId3 = crypto.randomUUID();
  const payloads3 = Array.from({ length: 10 }, (_, i) => ({
    requestId: reqId3,
    licenseKey: FIXTURES[`conflict_${i}`].key,
    deviceKeyId: c3.deviceKeyId,
    publicKey: c3.publicKeyBase64url,
    deviceProof: { challenge: chalRes3, signature: sig3 }
  }));
  const res3 = await fireRequests(target.url, payloads3);
  const success3 = res3.filter(r => r.body.status === "SUCCESS");
  const conflicts3 = res3.filter(r => r.body.error === "ACTIVATION_REQUEST_CONFLICT");
  assertEquals(success3.length + conflicts3.length, 10);
  assertEquals(success3.length, 1);

  // 4. Capacity Race maxDevices=1 (50 workers)
  console.log("4. Capacity Race maxDevices=1 (50 workers)");
  await resetDb();
  const payloads4 = await Promise.all(Array.from({ length: 50 }, async () => {
    const c = await generateClient();
    const chal = await (await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: c.deviceKeyId }) })).json();
    const sig = await sign(chal, c.publicKeyRaw, c.privateKeyRaw);
    return {
      requestId: crypto.randomUUID(), licenseKey: FIXTURES.max1_a.key, deviceKeyId: c.deviceKeyId,
      publicKey: c.publicKeyBase64url, deviceProof: { challenge: chal, signature: sig }
    };
  }));
  const res4 = await fireRequests(target.url, payloads4);
  const success4 = res4.filter(r => r.body.status === "SUCCESS");
  const limited4 = res4.filter(r => r.body.error === "DEVICE_LIMIT_REACHED");
  assertEquals(success4.length, 1);
  assertEquals(limited4.length, 49);
  const bindings4 = await sql`SELECT * FROM license_bindings WHERE license_id = ${FIXTURES.max1_a.id} AND status = 'ACTIVE'`;
  assertEquals(bindings4.length, 1);

  // 5. Capacity Race maxDevices=2 (20 workers)
  console.log("5. Capacity Race maxDevices=2 (20 workers)");
  await resetDb();
  const payloads5 = await Promise.all(Array.from({ length: 20 }, async () => {
    const c = await generateClient();
    const chal = await (await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: c.deviceKeyId }) })).json();
    const sig = await sign(chal, c.publicKeyRaw, c.privateKeyRaw);
    return {
      requestId: crypto.randomUUID(), licenseKey: FIXTURES.max2_a.key, deviceKeyId: c.deviceKeyId,
      publicKey: c.publicKeyBase64url, deviceProof: { challenge: chal, signature: sig }
    };
  }));
  const res5 = await fireRequests(target.url, payloads5);
  const success5 = res5.filter(r => r.body.status === "SUCCESS");
  const limited5 = res5.filter(r => r.body.error === "DEVICE_LIMIT_REACHED");
  assertEquals(success5.length, 2);
  assertEquals(limited5.length, 18);
  const bindings5 = await sql`SELECT * FROM license_bindings WHERE license_id = ${FIXTURES.max2_a.id} AND status = 'ACTIVE'`;
  assertEquals(bindings5.length, 2);

  // 6. Same Device Renewal Race (20 workers)
  console.log("6. Same Device Renewal Race (20 workers)");
  await resetDb();
  const c6 = await generateClient();
  // First bind the device
  const chalRes6a = await (await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: c6.deviceKeyId }) })).json();
  const sig6a = await sign(chalRes6a, c6.publicKeyRaw, c6.privateKeyRaw);
  await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseKey: FIXTURES.renewal.key, deviceKeyId: c6.deviceKeyId, publicKey: c6.publicKeyBase64url, deviceProof: { challenge: chalRes6a, signature: sig6a } })
  });
  
  // Now spam renewal requests with DIFFERENT request IDs and challenges
  const payloads6 = await Promise.all(Array.from({ length: 20 }, async () => {
    const chal = await (await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: c6.deviceKeyId }) })).json();
    const sig = await sign(chal, c6.publicKeyRaw, c6.privateKeyRaw);
    return {
      requestId: crypto.randomUUID(), licenseKey: FIXTURES.renewal.key, deviceKeyId: c6.deviceKeyId,
      publicKey: c6.publicKeyBase64url, deviceProof: { challenge: chal, signature: sig }
    };
  }));
  const res6 = await fireRequests(target.url, payloads6);
  const success6 = res6.filter(r => r.body.status === "SUCCESS");
  assertEquals(success6.length, 20); // They all succeed logically (idempotent / seamless renewal)
  
  const bindings6 = await sql`SELECT * FROM license_bindings WHERE device_key_id = ${c6.deviceKeyId}`;
  const activeBindings6 = bindings6.filter(b => b.status === 'ACTIVE');
  assertEquals(activeBindings6.length, 1); // Only ONE active binding should remain

  // 7. Repeatability (10 rounds of maxDevices=1 capacity race)
  console.log("7. Repeatability (10 rounds maxDevices=1)");
  let repSuccesses = 0;
  for (let i = 0; i < 10; i++) {
    await resetDb();
    const payloads7 = await Promise.all(Array.from({ length: 10 }, async () => {
      const c = await generateClient();
      const chal = await (await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: c.deviceKeyId }) })).json();
      const sig = await sign(chal, c.publicKeyRaw, c.privateKeyRaw);
      return {
        requestId: crypto.randomUUID(), licenseKey: FIXTURES.max1_a.key, deviceKeyId: c.deviceKeyId,
        publicKey: c.publicKeyBase64url, deviceProof: { challenge: chal, signature: sig }
      };
    }));
    const res7 = await fireRequests(target.url, payloads7);
    const success7 = res7.filter(r => r.body.status === "SUCCESS");
    if (success7.length !== 1) throw new Error(`Repeatability round ${i} failed! Successes: ${success7.length}`);
    repSuccesses++;
  }
  assertEquals(repSuccesses, 10);
  
  // 8. Rollback Semantics
  console.log("8. Rollback Semantics (Challenge state on failure)");
  await resetDb();
  const c8 = await generateClient();
  const chalRes8 = await (await fetch(`${target.url}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: c8.deviceKeyId }) })).json();
  const sig8 = await sign(chalRes8, c8.publicKeyRaw, c8.privateKeyRaw);
  
  // This will fail with LICENSE_NOT_FOUND (step 4), rolling back step 3 (challenge consumption)
  const res8 = await (await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseKey: "invalid-license-key", deviceKeyId: c8.deviceKeyId, publicKey: c8.publicKeyBase64url, deviceProof: { challenge: chalRes8, signature: sig8 } })
  })).json();
  
  assertEquals(res8.error, "LICENSE_NOT_FOUND");
  
  const chalCheck8 = await sql`SELECT status FROM device_challenges WHERE challenge_id = ${chalRes8.challengeId}`;
  assertEquals(chalCheck8[0].status, 'PENDING'); // Must be rolled back!

  // Now use the SAME challenge but with a valid license, to prove it's still usable
  const res8b = await (await fetch(target.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseKey: FIXTURES.max1_a.key, deviceKeyId: c8.deviceKeyId, publicKey: c8.publicKeyBase64url, deviceProof: { challenge: chalRes8, signature: sig8 } })
  })).json();
  
  assertEquals(res8b.status, "SUCCESS");
  
  const chalCheck8b = await sql`SELECT status FROM device_challenges WHERE challenge_id = ${chalRes8.challengeId}`;
  assertEquals(chalCheck8b[0].status, 'CONSUMED'); // Now it's consumed

  console.log(`[PASS] ${target.name}\n`);
}

async function run() {
  for (const target of TARGETS) {
    try {
      await runTests(target);
    } catch(e) {
      console.error(`TEST FAILED ON TARGET ${target.name}`, e);
      Deno.exit(1);
    }
  }
  
  console.log("ALL LOCAL CONCURRENCY MATRIX TESTS PASSED");
  Deno.exit(0);
}

run();
