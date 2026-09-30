import { PoolClient } from 'pg';

export class DeviceService {
  static async registerOrUpdateDevice(
    client: PoolClient,
    deviceKeyId: string,
    publicKey: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO devices (device_key_id, public_key, last_seen_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (device_key_id) DO UPDATE 
       SET last_seen_at = NOW(), public_key = EXCLUDED.public_key`,
      [deviceKeyId, publicKey]
    );
  }
}
