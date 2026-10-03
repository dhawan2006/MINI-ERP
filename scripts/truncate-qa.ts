import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(__dirname, '..', 'server', 'licensing', '.env');
const envStr = fs.readFileSync(envPath, 'utf8');
const dbUrlMatch = envStr.match(/DATABASE_URL=(.+)/);
if (!dbUrlMatch) throw new Error('No DATABASE_URL');
const dbUrl = dbUrlMatch[1].trim();

const pool = new Pool({ connectionString: dbUrl });

async function run() {
  console.log('Connecting to', dbUrl.split('@')[1]);
  await pool.query(`
    TRUNCATE TABLE 
      audit_events, 
      license_bindings, 
      activation_requests, 
      lifecycle_requests, 
      device_challenges, 
      devices, 
      licenses 
    CASCADE;
  `);
  console.log('Successfully truncated all licensing tables!');
  await pool.end();
}
run().catch(console.error);
