import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { hashLicenseKey } from "../../../supabase/functions/_shared/crypto/licenseKey.ts";
import crypto from "node:crypto";

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(DB_URL, { prepare: false });

const EDGE_URL = "http://127.0.0.1:54321/functions/v1/activate";
const HMAC_SECRET = "test-hmac-secret-32-chars-min-must-be-long-enough!";

// Generate a valid base64url uncompressed P-256 public key and a private key
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const publicKeyRaw = ecdh.getPublicKey(); // 65 bytes starting with 0x04
const publicKeyBase64url = Buffer.from(publicKeyRaw).toString('base64url');
const privateKeyRaw = ecdh.getPrivateKey();

const deviceKeyId = "test-device-id-" + Date.now();
const licenseKey = "test-license-key-123456789";
const licenseId = "20000000-0000-0000-0000-000000000001";

async function cleanup() {
  await sql`DELETE FROM license_bindings WHERE license_id = ${licenseId}`;
  await sql`DELETE FROM activation_requests WHERE license_id = ${licenseId}`;
  await sql`DELETE FROM device_challenges WHERE device_key_id = ${deviceKeyId}`;
  await sql`DELETE FROM devices WHERE device_key_id = ${deviceKeyId}`;
  await sql`DELETE FROM licenses WHERE id = ${licenseId}`;
}

async function setup() {
  await cleanup();
  const hmac = await hashLicenseKey(licenseKey, HMAC_SECRET);
  await sql`
    INSERT INTO licenses (id, product_id, license_key_hmac, max_devices, status, valid_from, valid_until)
    VALUES (
      ${licenseId},
      'mini-pos-v1',
      ${hmac},
      1,
      'ACTIVE',
      NOW() - INTERVAL '1 day',
      NOW() + INTERVAL '1 year'
    )
  `;
}

// Custom sign since Deno doesn't have node crypto exactly matching client, we'll use webcrypto
async function sign(challenge: any) {
  // We need the client's actual implementation, or just use webcrypto to sign.
  // We can use node:crypto since we are running in Deno which supports node:crypto
  const { canonicalize } = await import("../../../supabase/functions/_shared/crypto/canonicalize.ts");
  const canonicalBytes = Buffer.from(canonicalize(challenge), 'utf8');
  const domainTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
  const dataToSign = Buffer.concat([domainTag, canonicalBytes]);

  const p256Header = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex");
  const spki = Buffer.concat([p256Header, publicKeyRaw]);
  const pem = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
  const privPem = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420", "hex"), privateKeyRaw]), format: 'der', type: 'pkcs8' });
  
  const signObj = crypto.createSign('SHA256');
  signObj.update(dataToSign);
  return signObj.sign(privPem).toString('base64url');
}

async function runTests() {
  await setup();
  
  console.log("1. Request Challenge...");
  const challengeRes = await fetch(`${EDGE_URL}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceKeyId })
  });
  
  const challengeText = await challengeRes.text();
  console.log("Challenge:", challengeText);
  if (!challengeRes.ok) throw new Error("Challenge failed: " + challengeText);
  const challenge = JSON.parse(challengeText);
  
  console.log("2. Sign Challenge...");
  const signature = await sign(challenge);

  console.log("3. Submit Activation...");
  const requestId = crypto.randomUUID();
  const activationRes = await fetch(EDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId,
      licenseKey,
      deviceKeyId,
      publicKey: publicKeyBase64url,
      deviceProof: {
        challenge,
        signature
      }
    })
  });
  
  const activationText = await activationRes.text();
  console.log("Activation:", activationText);
  if (!activationRes.ok) throw new Error("Activation failed: " + activationText);

  // Assertions
  const activationResult = JSON.parse(activationText);
  assertEquals(activationResult.status, "SUCCESS");
  assertExists(activationResult.payload.authorization);

  // Idempotency
  console.log("4. Submit Idempotent Request...");
  const idempotencyRes = await fetch(EDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId,
      licenseKey,
      deviceKeyId,
      publicKey: publicKeyBase64url,
      deviceProof: { challenge, signature }
    })
  });
  const idempotencyText = await idempotencyRes.text();
  console.log("Idempotent Response:", idempotencyText);
  assertEquals(JSON.parse(idempotencyText).status, "SUCCESS");

  await cleanup();
  Deno.exit(0);
}

runTests().catch(e => {
  console.error("Test failed", e);
  Deno.exit(1);
});
