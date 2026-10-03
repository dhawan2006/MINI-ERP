import postgres from 'postgres';
import * as assert from 'node:assert/strict';

// Using the direct Supabase DB port exposed by local stack
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function setup() {
  const sql = postgres(DB_URL, { max: 20 });
  
  // Clear tables
  await sql`TRUNCATE TABLE audit_events, device_challenges, lifecycle_requests, activation_requests, license_bindings, devices, licenses CASCADE`;
  
  return sql;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Defer {
  promise: Promise<void>;
  resolve!: () => void;
  constructor() {
    this.promise = new Promise(res => this.resolve = res);
  }
}

async function runTests() {
  console.log('Running Transaction Mechanics Tests...');
  const sql = await setup();

  // Test A: BEGIN -> SELECT FOR UPDATE -> COMMIT
  console.log('A. Testing SELECT FOR UPDATE');
  const [licenseA] = await sql`INSERT INTO licenses (product_id, license_key_hmac, status, valid_from, valid_until, max_devices) VALUES ('PROD1', 'HMAC_A', 'ACTIVE', NOW(), NOW() + INTERVAL '1 year', 1) RETURNING id`;
  
  const step1 = new Defer();
  const step2 = new Defer();
  
  let tx1Done = false;
  const tx1 = sql.begin(async (tx) => {
    await tx`SELECT * FROM licenses WHERE id = ${licenseA.id} FOR UPDATE`;
    step1.resolve();
    await step2.promise; // Hold lock
    tx1Done = true;
  });

  await step1.promise; // Tx1 has lock
  
  let tx2Resolved = false;
  const tx2 = sql.begin(async (tx) => {
    await tx`SELECT * FROM licenses WHERE id = ${licenseA.id} FOR UPDATE`;
    tx2Resolved = true;
  });

  // Tx2 should be blocked
  await delay(100);
  assert.equal(tx2Resolved, false, 'Tx2 should be blocked by Tx1 lock');
  
  step2.resolve(); // Release Tx1
  await tx1;
  await tx2; // Tx2 should now finish
  assert.equal(tx2Resolved, true, 'Tx2 should finish after Tx1 releases lock');

  // Test B: SAVEPOINT -> Mutation -> ROLLBACK TO SAVEPOINT
  console.log('B. Testing SAVEPOINT rollback');
  await sql.begin(async (tx) => {
    await tx`INSERT INTO devices (device_key_id, public_key) VALUES ('DEV_B', 'PUB')`;
    await tx.savepoint(async (sp) => {
      await sp`INSERT INTO devices (device_key_id, public_key) VALUES ('DEV_B_2', 'PUB')`;
      throw new Error('Rollback SP');
    }).catch(e => { if (e.message !== 'Rollback SP') throw e; });
    // Should still have DEV_B but not DEV_B_2
  });
  
  const devB = await sql`SELECT * FROM devices WHERE device_key_id = 'DEV_B'`;
  assert.equal(devB.length, 1);
  const devB2 = await sql`SELECT * FROM devices WHERE device_key_id = 'DEV_B_2'`;
  assert.equal(devB2.length, 0);

  // Test C: Competing active-binding inserts / E: Partial unique index
  console.log('C/E. Testing Partial Unique Index (one active binding per device)');
  await sql`INSERT INTO devices (device_key_id, public_key) VALUES ('DEV_C', 'PUB')`;
  
  await sql`INSERT INTO license_bindings (license_id, device_key_id, status) VALUES (${licenseA.id}, 'DEV_C', 'ACTIVE')`;
  
  try {
    await sql`INSERT INTO license_bindings (license_id, device_key_id, status) VALUES (${licenseA.id}, 'DEV_C', 'ACTIVE')`;
    assert.fail('Should have violated unique_active_device_binding');
  } catch (e: any) {
    assert.ok(e.message.includes('unique_active_device_binding'), 'Constraint violated');
  }

  // Deactivated bindings don't trigger it
  await sql`UPDATE license_bindings SET status = 'DEACTIVATED', deactivated_at = NOW() WHERE device_key_id = 'DEV_C'`;
  await sql`INSERT INTO license_bindings (license_id, device_key_id, status) VALUES (${licenseA.id}, 'DEV_C', 'ACTIVE')`; // Should succeed now
  
  // Test F: Rollback after deliberate constraint failure
  console.log('F/H. Testing rollback and lock release after constraint failure');
  const [licenseF] = await sql`INSERT INTO licenses (product_id, license_key_hmac, status, valid_from, valid_until, max_devices) VALUES ('PROD1', 'HMAC_F', 'ACTIVE', NOW(), NOW() + INTERVAL '1 year', 1) RETURNING id`;
  
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT * FROM licenses WHERE id = ${licenseF.id} FOR UPDATE`;
      await tx`INSERT INTO devices (device_key_id, public_key) VALUES ('DEV_C', 'PUB')`; // Primary key conflict
    });
    assert.fail('Should fail');
  } catch(e) {}
  
  // Verify lock is released (we can get lock now)
  await sql.begin(async (tx) => {
    await tx`SELECT * FROM licenses WHERE id = ${licenseF.id} FOR UPDATE NOWAIT`;
  });

  // Test 5: Concurrency Proof
  console.log('5. Concurrency Proof (100 tx, max_devices=1)');
  const [licenseConc] = await sql`INSERT INTO licenses (product_id, license_key_hmac, status, valid_from, valid_until, max_devices) VALUES ('PROD_CONC', 'HMAC_CONC', 'ACTIVE', NOW(), NOW() + INTERVAL '1 year', 1) RETURNING id`;
  
  let successCount = 0;
  let conflictCount = 0;
  
  const workers = Array.from({length: 100}).map(async (_, i) => {
    const devId = `DEV_CONC_${i}`;
    try {
      await sql.begin(async (tx) => {
        // Idempotency pseudo-check
        // Upsert device
        await tx`INSERT INTO devices (device_key_id, public_key) VALUES (${devId}, 'PUB') ON CONFLICT DO NOTHING`;
        
        // Lock license
        await tx`SELECT * FROM licenses WHERE id = ${licenseConc.id} FOR UPDATE`;
        
        // Count active bindings
        const [{count}] = await tx`SELECT count(*) FROM license_bindings WHERE license_id = ${licenseConc.id} AND status = 'ACTIVE'`;
        if (parseInt(count) >= 1) {
          throw new Error('DEVICE_LIMIT_REACHED');
        }
        
        // Insert binding
        await tx`INSERT INTO license_bindings (license_id, device_key_id, status) VALUES (${licenseConc.id}, ${devId}, 'ACTIVE')`;
      });
      successCount++;
    } catch (e: any) {
      if (e.message === 'DEVICE_LIMIT_REACHED') {
        conflictCount++;
      } else {
        throw e;
      }
    }
  });
  
  await Promise.all(workers);
  
  assert.equal(successCount, 1, 'Only one transaction should succeed');
  assert.equal(conflictCount, 99, '99 transactions should hit the limit');

  // Idempotency test (100 requests same ID)
  console.log('5. Concurrency Proof (100 tx, same activationRequestId)');
  const reqId = '00000000-0000-0000-0000-000000000001';
  let insertSuccess = 0;
  let pkConflict = 0;
  
  const idempWorkers = Array.from({length: 100}).map(async () => {
    try {
      await sql`INSERT INTO activation_requests (request_id, request_fingerprint, status) VALUES (${reqId}, 'FINGERPRINT', 'PENDING')`;
      insertSuccess++;
    } catch (e: any) {
      if (e.code === '23505') { // unique_violation
        pkConflict++;
      }
    }
  });
  await Promise.all(idempWorkers);
  assert.equal(insertSuccess, 1);
  assert.equal(pkConflict, 99);

  // Failure/Rollback
  console.log('6. Failure/Rollback Testing');
  const [licenseFail] = await sql`INSERT INTO licenses (product_id, license_key_hmac, status, valid_from, valid_until, max_devices) VALUES ('PROD_FAIL', 'HMAC_FAIL', 'ACTIVE', NOW(), NOW() + INTERVAL '1 year', 1) RETURNING id`;
  try {
    await sql.begin(async tx => {
      await tx`INSERT INTO license_bindings (license_id, device_key_id, status) VALUES (${licenseFail.id}, 'DEV_C', 'ACTIVE')`;
      // Intentional failure after insert
      throw new Error('INTENTIONAL_FAIL');
    });
  } catch(e) {}
  
  // Ensure no partial state
  const failBindings = await sql`SELECT * FROM license_bindings WHERE license_id = ${licenseFail.id}`;
  assert.equal(failBindings.length, 0, 'Binding should have rolled back completely');

  console.log('✅ All Database Mechanics Tests Passed!');
  process.exit(0);
}

runTests().catch(e => {
  console.error('Test Failed:', e);
  process.exit(1);
});
