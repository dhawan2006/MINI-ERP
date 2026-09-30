import { getClient } from '../src/config/db';

export async function clearDatabase() {
  const client = await getClient();
  try {
    await client.query(`
      TRUNCATE TABLE 
        audit_events, 
        activation_requests, 
        lifecycle_requests,
        license_bindings,
        device_challenges,
        devices, 
        licenses 
      CASCADE;
    `);
  } finally {
    client.release();
  }
}
