const { Pool } = require('pg');
const crypto = require('crypto');

const dbPool = new Pool({
  connectionString: 'postgres://laksh@localhost:5432/minipos_licensing_qa'
});

const TEST_LICENSE_KEY = 'Z5QHH-AVBH7-ZT0NZ';
const TEST_LICENSE_ID = '266c9e29-12ed-4ed4-849f-e114fdc5d122';

const hmacSecret = 'qa_hmac_secret_qa_hmac_secret_qa_hmac_secret_123';
const canonicalKey = TEST_LICENSE_KEY.toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashedKey = crypto.createHmac('sha256', hmacSecret).update(canonicalKey).digest('hex');
console.log('Inserting hashed key:', hashedKey);

async function run() {
  await dbPool.query('DELETE FROM licenses WHERE id = $1', [TEST_LICENSE_ID]);
  await dbPool.query(`
    INSERT INTO licenses (id, license_key_hmac, product_id, valid_from, valid_until, max_devices, status) 
    VALUES ($1, $2, 'PROD_1', NOW(), NOW() + interval '1 year', 5, 'ACTIVE')
  `, [TEST_LICENSE_ID, hashedKey]);
  const res = await dbPool.query("SELECT * FROM licenses WHERE id = $1", [TEST_LICENSE_ID]);
  console.log('Rows:', res.rows.length);
  await dbPool.end();
}

run().catch(console.error);
