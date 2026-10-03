import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import crypto from "node:crypto";
import { hashLicenseKey } from "../../../supabase/functions/_shared/crypto/licenseKey.ts";

const HOSTED_URL = "https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1/activate";
const HOSTED_HMAC_SECRET = "ac2ba941bdb735215819756a3145d1f79f03709639e61d9dde35c3fdd16886ca";

const FIXTURES = {
  max1: { id: "40000000-0000-0000-0000-000000000001", key: "test-hosted-max1", max: 1 },
};

async function executeSql(sql: string) {
  const p = new Deno.Command("npx", {
    args: ["supabase", "db", "query", "--linked", sql],
    stdout: "piped",
    stderr: "piped"
  });
  const { code, stderr } = await p.output();
  if (code !== 0) throw new Error("DB Query failed: " + new TextDecoder().decode(stderr));
}

async function resetDb() {
  await executeSql(`
    DELETE FROM audit_events;
    DELETE FROM license_bindings;
    DELETE FROM activation_requests;
    DELETE FROM device_challenges;
    DELETE FROM devices;
    DELETE FROM licenses;
  `);

  const hmac = await hashLicenseKey(FIXTURES.max1.key, HOSTED_HMAC_SECRET);
  await executeSql(`
    INSERT INTO licenses (id, product_id, license_key_hmac, max_devices, status, valid_from, valid_until)
    VALUES ('${FIXTURES.max1.id}', 'mini-pos-v1', '${hmac}', ${FIXTURES.max1.max}, 'ACTIVE', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 year');
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
  return {
    deviceKeyId: "dev-" + crypto.randomUUID(),
    publicKeyRaw: ecdh.getPublicKey(),
    publicKeyBase64url: Buffer.from(ecdh.getPublicKey()).toString('base64url'),
    privateKeyRaw: ecdh.getPrivateKey()
  };
}

async function fireRequests(payloads: any[]) {
  const start = Date.now();
  const promises = payloads.map(p => fetch(HOSTED_URL, {
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
  const res = await Promise.all(promises);
  return { results: res, duration: Date.now() - start };
}

async function runLoadTest(concurrency: number) {
  console.log(`\n--- HOSTED QA CONCURRENCY: ${concurrency} ---`);
  await resetDb();

  const payloads = await Promise.all(Array.from({ length: concurrency }, async () => {
    const c = await generateClient();
    const chal = await (await fetch(`${HOSTED_URL}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKeyId: c.deviceKeyId }) })).json();
    const sig = await sign(chal, c.publicKeyRaw, c.privateKeyRaw);
    return {
      requestId: crypto.randomUUID(), licenseKey: FIXTURES.max1.key, deviceKeyId: c.deviceKeyId,
      publicKey: c.publicKeyBase64url, deviceProof: { challenge: chal, signature: sig }
    };
  }));

  console.log(`Firing ${concurrency} simultaneous requests...`);
  const { results, duration } = await fireRequests(payloads);
  
  const success = results.filter(r => r.body.status === "SUCCESS");
  const limited = results.filter(r => r.body.error === "DEVICE_LIMIT_REACHED");
  const errors = results.filter(r => r.body.status !== "SUCCESS" && r.body.error !== "DEVICE_LIMIT_REACHED");

  console.log(`Results: ${success.length} SUCCESS, ${limited.length} LIMITED, ${errors.length} INFRA ERRORS/TIMEOUTS`);
  console.log(`Duration: ${duration}ms`);
  
  if (errors.length > 0) {
    console.log("Infra Error Samples:", errors.slice(0, 3).map(e => e.body));
  }
  
  // Strict correctness check: Success CANNOT exceed maxDevices!
  if (success.length > 1) {
    console.error(`FATAL CORRECTNESS FAILURE: Allowed ${success.length} activations on a 1-device license!`);
    Deno.exit(1);
  }
}

async function run() {
  await runLoadTest(10);
  await runLoadTest(25);
  await runLoadTest(50);
  await runLoadTest(100);
  console.log("\nALL HOSTED LOAD TESTS FINISHED.");
}

run();
