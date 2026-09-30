import { pool } from '../src/config/db';
import { LicenseService } from '../src/services/LicenseService';

async function generate() {
  const client = await pool.connect();
  try {
    const validFrom = new Date();
    const validUntil = new Date();
    validUntil.setMinutes(validUntil.getMinutes() + 2);
    
    const { licenseId, licenseKey } = await LicenseService.createLicense(
      client,
      'minipos-pro-v1',
      validFrom,
      validUntil,
      1
    );
    
    console.log(JSON.stringify({ licenseId, licenseKey }));
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

generate();
