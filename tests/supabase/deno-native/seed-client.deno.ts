import { hashLicenseKey } from "../../../supabase/functions/_shared/crypto/licenseKey.ts";

const args = Deno.args;
const isHosted = args.includes("--hosted");

const LOCAL_HMAC_SECRET = "test-hmac-secret-32-chars-min-must-be-long-enough!";
const HOSTED_HMAC_SECRET = "ac2ba941bdb735215819756a3145d1f79f03709639e61d9dde35c3fdd16886ca";
const secret = isHosted ? HOSTED_HMAC_SECRET : LOCAL_HMAC_SECRET;

const FIXTURES = {
  deact: { id: "10000000-0000-0000-0000-000000000098", key: "test-deact-valid", max: 5 },
  full: { id: "10000000-0000-0000-0000-000000000099", key: "test-full-lifecycle-valid", max: 1 },
};

async function executeSql(sqlStmt: string) {
  if (isHosted) {
    const command = new Deno.Command("npx", {
      args: ["supabase", "db", "query", "--linked", sqlStmt],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await command.output();
    if (!output.success) throw new Error(`Query failed: ${new TextDecoder().decode(output.stderr)}`);
  } else {
    // using psql for local to avoid pulling in postgres.js dependency if not needed, but we have it.
    const command = new Deno.Command("npx", {
      args: ["supabase", "db", "query", "--local", sqlStmt],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await command.output();
    if (!output.success) throw new Error(`Query failed: ${new TextDecoder().decode(output.stderr)}`);
  }
}

async function run() {
  let deletes = `
    DELETE FROM audit_events;
    DELETE FROM license_bindings;
    DELETE FROM activation_requests;
    DELETE FROM device_challenges;
    DELETE FROM devices;
    DELETE FROM licenses WHERE id IN ('${FIXTURES.deact.id}', '${FIXTURES.full.id}');
  `;
  await executeSql(deletes);

  let inserts = "";
  for (const f of Object.values(FIXTURES)) {
    const hmac = await hashLicenseKey(f.key, secret);
    inserts += `
      INSERT INTO licenses (id, product_id, license_key_hmac, max_devices, status, valid_from, valid_until)
      VALUES ('${f.id}', 'mini-pos-v1', '${hmac}', ${f.max}, 'ACTIVE', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 year');
    `;
  }
  await executeSql(inserts);
  console.log(`Seeded client test licenses on ${isHosted ? 'HOSTED QA' : 'LOCAL'}`);
}

await run();
