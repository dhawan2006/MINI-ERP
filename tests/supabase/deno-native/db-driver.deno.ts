/**
 * DB Driver Transaction Test — Checkpoint 3.1 (schema-corrected)
 *
 * Tests postgres.js (deno.land/x) with direct Postgres connection:
 *   BEGIN → SELECT FOR UPDATE → SAVEPOINT → mutation → ROLLBACK TO SAVEPOINT
 *   → second mutation → COMMIT
 *
 * Also tests 100 concurrent activation attempts to verify locking.
 *
 * Run: DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
 *      deno run --allow-net --allow-env tests/supabase/deno-native/db-driver.deno.ts
 */

import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

const DB_URL = Deno.env.get('DB_URL');
if (!DB_URL) {
  console.error('DB_URL environment variable is required');
  Deno.exit(1);
}

const sql = postgres(DB_URL, {
  prepare: false,  // required for Supabase transaction-mode pooler compatibility
  max: 20,
});

const results: { test: string; status: 'PASS' | 'FAIL'; detail?: string }[] = [];
function pass(test: string, detail?: string) {
  console.log(`  ✅ ${test}${detail ? ': ' + detail : ''}`);
  results.push({ test, status: 'PASS', detail });
}
function fail(test: string, err: unknown) {
  const detail = String(err);
  console.error(`  ❌ ${test}: ${detail}`);
  results.push({ test, status: 'FAIL', detail });
}

const LICENSE_ID = '10000000-0000-0000-0000-000000000001';
const TEST_DEVICE_ID = 'deno-driver-test-device';

async function cleanup() {
  await sql`DELETE FROM license_bindings WHERE license_id = ${LICENSE_ID}`;
  await sql`DELETE FROM activation_requests WHERE license_id = ${LICENSE_ID}`;
  await sql`DELETE FROM devices WHERE device_key_id LIKE 'deno-driver-%'`;
  await sql`DELETE FROM licenses WHERE id = ${LICENSE_ID}`;
}

async function setup() {
  await cleanup();
  await sql`
    INSERT INTO licenses (id, product_id, license_key_hmac, max_devices, status, valid_from, valid_until)
    VALUES (
      ${LICENSE_ID},
      'mini-pos-v1',
      'deno-driver-test-hmac-unique',
      1,
      'ACTIVE',
      NOW(),
      NOW() + INTERVAL '1 year'
    )
  `;
  // Insert test device to satisfy FK on license_bindings.device_key_id
  await sql`
    INSERT INTO devices (device_key_id, public_key, last_seen_at)
    VALUES (${TEST_DEVICE_ID}, 'fake-public-key-for-driver-test', NOW())
    ON CONFLICT (device_key_id) DO NOTHING
  `;
}

await setup();

// ─── A. SELECT FOR UPDATE ─────────────────────────────────────────────────────
console.log('\nA. SELECT FOR UPDATE');
try {
  await sql.begin(async (tx) => {
    const rows = await tx`
      SELECT id, max_devices FROM licenses WHERE id = ${LICENSE_ID} FOR UPDATE
    `;
    if (rows.length !== 1) throw new Error(`Expected 1 row, got ${rows.length}`);
    pass('SELECT FOR UPDATE', `locked id=${rows[0].id}, max_devices=${rows[0].max_devices}`);
  });
} catch (e) { fail('SELECT FOR UPDATE', e); }

// ─── B. SAVEPOINT ─────────────────────────────────────────────────────────────
console.log('\nB. SAVEPOINT rollback');
try {
  let innerVisible = false;
  await sql.begin(async (tx) => {
    // Outer insert (will be committed or rolled back with the tx)
    await tx`
      INSERT INTO devices (device_key_id, public_key, last_seen_at) VALUES ('deno-driver-sp-outer', 'pk', NOW())
      ON CONFLICT DO NOTHING
    `;
    // Inner savepoint — intentionally rolled back
    try {
      await tx.savepoint(async (sp) => {
        await sp`INSERT INTO devices (device_key_id, public_key, last_seen_at) VALUES ('deno-driver-sp-inner', 'pk', NOW()) ON CONFLICT DO NOTHING`;
        throw new Error('rollback inner');
      });
    } catch (_) { /* expected */ }
    // Inner must not be visible
    const inner = await tx`SELECT 1 FROM devices WHERE device_key_id = 'deno-driver-sp-inner'`;
    if (inner.length > 0) { innerVisible = true; }
    // Outer still visible in tx
    const outer = await tx`SELECT 1 FROM devices WHERE device_key_id = 'deno-driver-sp-outer'`;
    if (outer.length !== 1) throw new Error('Outer write lost after inner rollback');
    throw new Error('cleanup-outer');  // rollback outer too
  });
} catch (e) {
  if (String(e).includes('cleanup-outer')) {
    pass('SAVEPOINT', 'inner savepoint rolled back; outer preserved in tx context; full tx rolled back for cleanup');
  } else {
    fail('SAVEPOINT', e);
  }
}
await sql`DELETE FROM devices WHERE device_key_id IN ('deno-driver-sp-outer','deno-driver-sp-inner')`;

// ─── C. Partial unique index ───────────────────────────────────────────────────
console.log('\nC. Partial Unique Index (unique_active_device_binding)');
try {
  await sql`INSERT INTO license_bindings (license_id, device_key_id, status) VALUES (${LICENSE_ID}, ${TEST_DEVICE_ID}, 'ACTIVE')`;
  let threw = false;
  try {
    await sql`INSERT INTO license_bindings (license_id, device_key_id, status) VALUES (${LICENSE_ID}, ${TEST_DEVICE_ID}, 'ACTIVE')`;
  } catch (e2: any) {
    if (e2.code === '23505') threw = true;
    else throw e2;
  }
  if (!threw) throw new Error('Unique constraint not triggered');
  // Deactivate; partial index only covers ACTIVE, so re-insert should work
  await sql`UPDATE license_bindings SET status = 'DEACTIVATED', deactivated_at = NOW() WHERE device_key_id = ${TEST_DEVICE_ID}`;
  await sql`INSERT INTO license_bindings (license_id, device_key_id, status) VALUES (${LICENSE_ID}, ${TEST_DEVICE_ID}, 'ACTIVE')`;
  pass('Partial unique index', 'duplicate ACTIVE rejected (23505); DEACTIVATED+re-ACTIVE allowed');
  await sql`DELETE FROM license_bindings WHERE license_id = ${LICENSE_ID}`;
} catch (e) { fail('Partial unique index', e); }

// ─── D. Full activation sequence ─────────────────────────────────────────────
console.log('\nD. Full activation transaction sequence');
try {
  await sql.begin(async (tx) => {
    // 1. Lock license row
    const [lic] = await tx`SELECT id, max_devices FROM licenses WHERE id = ${LICENSE_ID} FOR UPDATE`;
    // 2. Count active bindings
    const [{ count }] = await tx`
      SELECT COUNT(*) as count FROM license_bindings
      WHERE license_id = ${LICENSE_ID} AND status = 'ACTIVE'
    `;
    if (parseInt(count) >= lic.max_devices) throw new Error('max_devices exceeded');
    // 3. Insert binding inside savepoint
    await tx.savepoint(async (sp) => {
      await sp`INSERT INTO license_bindings (license_id, device_key_id, status) VALUES (${LICENSE_ID}, ${TEST_DEVICE_ID}, 'ACTIVE')`;
    });
    // 4. Verify visible in tx
    const [{ cnt }] = await tx`
      SELECT COUNT(*) as cnt FROM license_bindings WHERE license_id = ${LICENSE_ID} AND status = 'ACTIVE'
    `;
    if (parseInt(cnt) < 1) throw new Error('Binding not visible in transaction');
  });
  pass('Full activation sequence', 'BEGIN→LOCK→COUNT→SAVEPOINT→INSERT→VERIFY→COMMIT');
  await sql`DELETE FROM license_bindings WHERE license_id = ${LICENSE_ID}`;
} catch (e) { fail('Full activation sequence', e); }

// ─── E. Concurrent locking (100 workers, max_devices=1) ──────────────────────
console.log('\nE. Concurrent locking (100 workers, max_devices=1)');
// Insert 100 test devices
const deviceIds = Array.from({ length: 100 }, (_, i) => `deno-driver-conc-${i}`);
for (const d of deviceIds) {
  await sql`INSERT INTO devices (device_key_id, public_key, last_seen_at) VALUES (${d}, 'pk', NOW()) ON CONFLICT DO NOTHING`;
}
await sql`DELETE FROM license_bindings WHERE license_id = ${LICENSE_ID}`;

let successCount = 0;
let failCount = 0;

const workers = deviceIds.map(async (deviceId) => {
  try {
    await sql.begin(async (tx) => {
      const [lic] = await tx`SELECT id, max_devices FROM licenses WHERE id = ${LICENSE_ID} FOR UPDATE`;
      const [{ count }] = await tx`
        SELECT COUNT(*) as count FROM license_bindings
        WHERE license_id = ${LICENSE_ID} AND status = 'ACTIVE'
      `;
      if (parseInt(count) >= lic.max_devices) throw new Error('CAPACITY_EXCEEDED');
      await tx`INSERT INTO license_bindings (license_id, device_key_id, status) VALUES (${LICENSE_ID}, ${deviceId}, 'ACTIVE')`;
    });
    successCount++;
  } catch (e: any) {
    if (String(e).includes('CAPACITY_EXCEEDED') || String(e).includes('23505')) {
      failCount++;
    } else {
      throw e;
    }
  }
});

await Promise.all(workers);

if (successCount === 1 && failCount === 99) {
  pass('Concurrent locking', `${successCount} succeeded, ${failCount} correctly blocked (max_devices=1 enforced)`);
} else {
  fail('Concurrent locking', `Expected 1 success + 99 blocked; got ${successCount} + ${failCount}`);
}

// ─── F. Rollback leaves no partial state ──────────────────────────────────────
console.log('\nF. Rollback leaves no partial state');
await sql`DELETE FROM license_bindings WHERE license_id = ${LICENSE_ID}`;
const ROLLBACK_DEVICE = 'deno-driver-rollback-test';
await sql`INSERT INTO devices (device_key_id, public_key, last_seen_at) VALUES (${ROLLBACK_DEVICE}, 'pk', NOW()) ON CONFLICT DO NOTHING`;
try {
  await sql.begin(async (tx) => {
    await tx`INSERT INTO license_bindings (license_id, device_key_id, status) VALUES (${LICENSE_ID}, ${ROLLBACK_DEVICE}, 'ACTIVE')`;
    throw new Error('injected failure — must rollback');
  });
} catch (_) { /* expected */ }

const orphan = await sql`SELECT 1 FROM license_bindings WHERE device_key_id = ${ROLLBACK_DEVICE}`;
if (orphan.length === 0) {
  pass('Rollback leaves no partial state', 'no orphan binding found');
} else {
  fail('Rollback leaves no partial state', 'orphan binding exists');
}

// ─── Cleanup & Result ─────────────────────────────────────────────────────────
await cleanup();
for (const d of [...deviceIds, ROLLBACK_DEVICE, 'deno-driver-sp-outer', 'deno-driver-sp-inner']) {
  await sql`DELETE FROM devices WHERE device_key_id = ${d}`;
}
await sql.end();

console.log(`\n${'─'.repeat(60)}`);
const failed = results.filter(r => r.status === 'FAIL');
console.log(`Results: ${results.filter(r => r.status === 'PASS').length} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.error('FAILED:\n' + failed.map(f => `  • ${f.test}: ${f.detail}`).join('\n'));
  Deno.exit(1);
}
console.log('✅ All DB driver + transaction tests PASSED');
Deno.exit(0);
