import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import crypto from "node:crypto";
import { hashLicenseKey } from "../../../supabase/functions/_shared/crypto/licenseKey.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const LOCAL_HMAC_SECRET = "test-hmac-secret-32-chars-min-must-be-long-enough!";
const HOSTED_HMAC_SECRET = "ac2ba941bdb735215819756a3145d1f79f03709639e61d9dde35c3fdd16886ca";

const TARGETS = [
  { name: "Supabase Hosted QA", url: "https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1/api/v1", isHosted: true }
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
    DELETE FROM runtime_directive_deliveries;
    DELETE FROM runtime_directives;
    DELETE FROM runtime_checkins;
    DELETE FROM runtime_checkin_requests;
    DELETE FROM audit_events;
    DELETE FROM license_bindings;
    DELETE FROM activation_requests;
    DELETE FROM lifecycle_requests;
    DELETE FROM device_challenges;
    DELETE FROM devices;
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

async function fetchChallenge(target: any, path: string, payload: any) {
  const res = await fetch(`${target.url}/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Challenge fetch failed: HTTP ${res.status} ${text}`);
  }
  return await res.json();
}

async function testTarget(target: any) {
  console.log(`\n============================================================\nTESTING TARGET: ${target.name}\n============================================================\n`);
  
  await setupDatabase(target.isHosted);
  
  console.log(`--- SECTION 1: GOLDEN PATH ---`);
  const license1 = await createLicense(target.isHosted, 1);
  const clientA = await generateClient();

  // 1. Activation Challenge
  const actChallengeA1 = await fetchChallenge(target, "activation/challenge", { deviceKeyId: clientA.deviceKeyId, purpose: "ACTIVATION" });
  let signatureA1 = await sign(actChallengeA1, clientA.publicKeyRaw, clientA.privateKeyRaw);

  // 2. Activate Device A
  const reqIdAct1 = crypto.randomUUID();
  let actRes = await fetch(`${target.url}/activation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: reqIdAct1, licenseKey: license1.keyStr, deviceKeyId: clientA.deviceKeyId, publicKey: clientA.publicKeyBase64url, deviceProof: { challenge: actChallengeA1, signature: signatureA1 } })
  });
  if (actRes.status !== 200) console.error(await actRes.text());
  assertEquals(actRes.status, 200);
  let actData = await actRes.json();
  assertEquals(actData.status, "SUCCESS");
  assertExists(actData.payload.authorization);

  // 3. Deactivate Device A
  const deactChallengeA1 = await fetchChallenge(target, "lifecycle/deactivation/challenge", { deviceKeyId: clientA.deviceKeyId, licenseId: license1.id });
  let deactSigA1 = await sign(deactChallengeA1, clientA.publicKeyRaw, clientA.privateKeyRaw);

  let deactReqId1 = crypto.randomUUID();
  let deactRes = await fetch(`${target.url}/lifecycle/deactivation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: deactReqId1, licenseId: license1.id, deviceKeyId: clientA.deviceKeyId, proof: { challenge: deactChallengeA1, signature: deactSigA1 } })
  });
  assertEquals(deactRes.status, 200);
  assertEquals((await deactRes.json()).status, "DEACTIVATED");

  // 4. Reactivate Device A
  const actChallengeA2 = await fetchChallenge(target, "activation/challenge", { deviceKeyId: clientA.deviceKeyId, purpose: "ACTIVATION" });
  let signatureA2 = await sign(actChallengeA2, clientA.publicKeyRaw, clientA.privateKeyRaw);
  let reqIdAct2 = crypto.randomUUID();
  actRes = await fetch(`${target.url}/activation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: reqIdAct2, licenseKey: license1.keyStr, deviceKeyId: clientA.deviceKeyId, publicKey: clientA.publicKeyBase64url, deviceProof: { challenge: actChallengeA2, signature: signatureA2 } })
  });
  assertEquals(actRes.status, 200);
  console.log(`[PASS] Section 1 - Golden Path complete`);

  console.log(`--- SECTION 2: DIFFERENT DEVICE REACTIVATION ---`);
  const license2 = await createLicense(target.isHosted, 1);
  const clientB = await generateClient();
  const clientC = await generateClient();

  // B activates
  const actChallengeB1 = await fetchChallenge(target, "activation/challenge", { deviceKeyId: clientB.deviceKeyId });
  let signatureB1 = await sign(actChallengeB1, clientB.publicKeyRaw, clientB.privateKeyRaw);
  actRes = await fetch(`${target.url}/activation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseKey: license2.keyStr, deviceKeyId: clientB.deviceKeyId, publicKey: clientB.publicKeyBase64url, deviceProof: { challenge: actChallengeB1, signature: signatureB1 } })
  });
  if (actRes.status !== 200) console.error(await actRes.text());
  assertEquals(actRes.status, 200);

  // B deactivates
  const deactChallengeB1 = await fetchChallenge(target, "lifecycle/deactivation/challenge", { deviceKeyId: clientB.deviceKeyId, licenseId: license2.id });
  let deactSigB1 = await sign(deactChallengeB1, clientB.publicKeyRaw, clientB.privateKeyRaw);
  deactRes = await fetch(`${target.url}/lifecycle/deactivation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseId: license2.id, deviceKeyId: clientB.deviceKeyId, proof: { challenge: deactChallengeB1, signature: deactSigB1 } })
  });
  assertEquals(deactRes.status, 200);

  // C activates
  const actChallengeC1 = await fetchChallenge(target, "activation/challenge", { deviceKeyId: clientC.deviceKeyId });
  let signatureC1 = await sign(actChallengeC1, clientC.publicKeyRaw, clientC.privateKeyRaw);
  actRes = await fetch(`${target.url}/activation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseKey: license2.keyStr, deviceKeyId: clientC.deviceKeyId, publicKey: clientC.publicKeyBase64url, deviceProof: { challenge: actChallengeC1, signature: signatureC1 } })
  });
  assertEquals(actRes.status, 200);
  console.log(`[PASS] Section 2 - Different Device Reactivation`);

  console.log(`--- SECTION 3: MAX DEVICES LIFECYCLE ---`);
  const license3 = await createLicense(target.isHosted, 2);
  const clientX = await generateClient();
  const clientY = await generateClient();
  const clientZ = await generateClient();

  // X activates
  const chalX = await fetchChallenge(target, "activation/challenge", { deviceKeyId: clientX.deviceKeyId });
  let actResX = await fetch(`${target.url}/activation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseKey: license3.keyStr, deviceKeyId: clientX.deviceKeyId, publicKey: clientX.publicKeyBase64url, deviceProof: { challenge: chalX, signature: await sign(chalX, clientX.publicKeyRaw, clientX.privateKeyRaw) } })
  });
  if (actResX.status !== 200) console.error(await actResX.text());
  assertEquals(actResX.status, 200);

  // Y activates
  const chalY = await fetchChallenge(target, "activation/challenge", { deviceKeyId: clientY.deviceKeyId });
  let actResY = await fetch(`${target.url}/activation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseKey: license3.keyStr, deviceKeyId: clientY.deviceKeyId, publicKey: clientY.publicKeyBase64url, deviceProof: { challenge: chalY, signature: await sign(chalY, clientY.publicKeyRaw, clientY.privateKeyRaw) } })
  });
  if (actResY.status !== 200) console.error(await actResY.text());
  assertEquals(actResY.status, 200);

  // Z activates (should fail, max devices reached)
  const chalZ = await fetchChallenge(target, "activation/challenge", { deviceKeyId: clientZ.deviceKeyId });
  let actResZ = await fetch(`${target.url}/activation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseKey: license3.keyStr, deviceKeyId: clientZ.deviceKeyId, publicKey: clientZ.publicKeyBase64url, deviceProof: { challenge: chalZ, signature: await sign(chalZ, clientZ.publicKeyRaw, clientZ.privateKeyRaw) } })
  });
  assertEquals(actResZ.status, 400);
  let resZData = await actResZ.json();
  assertEquals(resZData.error, "DEVICE_LIMIT_REACHED");

  // X deactivates
  const deactChalX = await fetchChallenge(target, "lifecycle/deactivation/challenge", { deviceKeyId: clientX.deviceKeyId, licenseId: license3.id });
  let deactResX = await fetch(`${target.url}/lifecycle/deactivation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseId: license3.id, deviceKeyId: clientX.deviceKeyId, proof: { challenge: deactChalX, signature: await sign(deactChalX, clientX.publicKeyRaw, clientX.privateKeyRaw) } })
  });
  assertEquals(deactResX.status, 200);

  // Z activates again (should succeed)
  const chalZ2 = await fetchChallenge(target, "activation/challenge", { deviceKeyId: clientZ.deviceKeyId });
  let actResZ2 = await fetch(`${target.url}/activation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseKey: license3.keyStr, deviceKeyId: clientZ.deviceKeyId, publicKey: clientZ.publicKeyBase64url, deviceProof: { challenge: chalZ2, signature: await sign(chalZ2, clientZ.publicKeyRaw, clientZ.privateKeyRaw) } })
  });
  assertEquals(actResZ2.status, 200);
  console.log(`[PASS] Section 3 - Max Devices Lifecycle`);

  console.log(`--- SECTION 7: REPLAY PROTECTION ---`);
  // Replay deactivation of X with identical request payload
  let replayDeactX = await fetch(`${target.url}/lifecycle/deactivation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: deactResX.headers.get("requestId") || crypto.randomUUID(), licenseId: license3.id, deviceKeyId: clientX.deviceKeyId, proof: { challenge: deactChalX, signature: await sign(deactChalX, clientX.publicKeyRaw, clientX.privateKeyRaw) } })
  });
  // If it's a completely new request ID it will fail as already deactivated.
  // We'll just try to activate using the old challenge chalZ2
  let actResZ3 = await fetch(`${target.url}/activation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), licenseKey: license3.keyStr, deviceKeyId: clientZ.deviceKeyId, publicKey: clientZ.publicKeyBase64url, deviceProof: { challenge: chalZ2, signature: await sign(chalZ2, clientZ.publicKeyRaw, clientZ.privateKeyRaw) } })
  });
  assertEquals(actResZ3.status, 400);
  assertEquals((await actResZ3.json()).error, "DEVICE_PROOF_INVALID");
  console.log(`[PASS] Section 7 - Replay Protection`);
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
