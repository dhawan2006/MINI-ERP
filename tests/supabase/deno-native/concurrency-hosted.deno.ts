import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { hashLicenseKey } from "../../../supabase/functions/_shared/crypto/licenseKey.ts";
import crypto from "node:crypto";

const EDGE_URL = "https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1/activate";
const HMAC_SECRET = "ac2ba941bdb735215819756a3145d1f79f03709639e61d9dde35c3fdd16886ca";

const licenseKey = "test-license-key-concurrency";
const licenseId = "30000000-0000-0000-0000-000000000001";

async function runQuery(sql: string) {
  const command = new Deno.Command("npx", {
    args: ["supabase", "db", "query", "--linked", sql],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  if (!output.success) {
    console.error("Query failed:", new TextDecoder().decode(output.stderr));
    throw new Error("Query failed");
  }
  return new TextDecoder().decode(output.stdout);
}

async function setup() {
  await runQuery(`DELETE FROM license_bindings WHERE license_id = '${licenseId}';`);
  await runQuery(`DELETE FROM activation_requests WHERE license_id = '${licenseId}';`);
  await runQuery(`DELETE FROM device_challenges WHERE purpose = 'ACTIVATION';`);
  await runQuery(`DELETE FROM devices WHERE device_key_id LIKE 'conc-device-%';`);
  await runQuery(`DELETE FROM licenses WHERE id = '${licenseId}';`);
  
  const hmac = await hashLicenseKey(licenseKey, HMAC_SECRET);
  await runQuery(`
    INSERT INTO licenses (id, product_id, license_key_hmac, max_devices, status, valid_from, valid_until)
    VALUES ('${licenseId}', 'mini-pos-v1', '${hmac}', 1, 'ACTIVE', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 year');
  `);
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
  const publicKeyRaw = ecdh.getPublicKey();
  const publicKeyBase64url = Buffer.from(publicKeyRaw).toString('base64url');
  const privateKeyRaw = ecdh.getPrivateKey();
  const deviceKeyId = "conc-device-" + crypto.randomUUID();
  return { deviceKeyId, publicKeyRaw, publicKeyBase64url, privateKeyRaw };
}

async function runTests() {
  await setup();
  console.log("Starting 10 concurrent activations (max_devices=1)");

  const clients = await Promise.all(Array.from({ length: 10 }, () => generateClient()));
  
  // Create challenges
  const payloadPromises = clients.map(async (client) => {
    const res = await fetch(`${EDGE_URL}/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceKeyId: client.deviceKeyId })
    });
    const challenge = await res.json();
    const signature = await sign(challenge, client.publicKeyRaw, client.privateKeyRaw);
    return {
      requestId: crypto.randomUUID(),
      licenseKey,
      deviceKeyId: client.deviceKeyId,
      publicKey: client.publicKeyBase64url,
      deviceProof: { challenge, signature }
    };
  });
  
  const payloads = await Promise.all(payloadPromises);

  // Fire all requests concurrently
  const activationPromises = payloads.map(payload => 
    fetch(EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(r => r.json())
  );
  
  const results = await Promise.all(activationPromises);
  
  let successes = 0;
  let deviceLimits = 0;
  
  for (const r of results) {
    if (r.status === "SUCCESS") successes++;
    else if (r.error === "DEVICE_LIMIT_REACHED") deviceLimits++;
    else {
      console.error("Unexpected error result:", r);
    }
  }

  console.log(`Successes: ${successes}, Limits Reached: ${deviceLimits}`);
  
  // Verify DB state
  const out = await runQuery(`SELECT COUNT(*) FROM license_bindings WHERE license_id = '${licenseId}' AND status = 'ACTIVE';`);
  console.log("Final active bindings count query output:", out);

  assertEquals(successes, 1);
  assertEquals(deviceLimits, 9);
  
  Deno.exit(0);
}

runTests().catch(e => {
  console.error("Test failed", e);
  Deno.exit(1);
});
