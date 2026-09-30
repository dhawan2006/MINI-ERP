import { SignedAuthorization } from '../../server/licensing/src/crypto/ServerAuthorizationSigner';
import crypto from 'crypto';

export interface ProofPayload {
  challenge: any;
  signature: string;
}

export class LicensingClient {
  constructor(private readonly baseUrl: string) {}

  async getChallenge(deviceKeyId: string): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/activation/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
        body: JSON.stringify({ deviceKeyId, purpose: 'ACTIVATION' }),
      });
      if (!res.ok) {
        throw new Error(`HTTP_${res.status}`);
      }
      const data = await res.json();
      return data;
    } catch (err: any) {
      throw new Error(`NETWORK_ERROR: ${err.message}`);
    }
  }

  async activate(
    licenseKey: string,
    deviceKeyId: string,
    publicKey: string,
    proof: ProofPayload,
    deviceName?: string
  ): Promise<SignedAuthorization> {
    try {
      // Must include a randomly generated requestId as required by the server schema
      const requestId = crypto.randomUUID();
      const res = await fetch(`${this.baseUrl}/api/v1/activation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
        body: JSON.stringify({ requestId, licenseKey, deviceKeyId, publicKey, deviceProof: proof, deviceName }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`HTTP_${res.status}: ${errorText}`);
      }
      
      const data = await res.json();
      return data.payload.authorization as SignedAuthorization;
    } catch (err: any) {
      if (err.message.startsWith('HTTP_')) {
        throw err;
      }
      throw new Error(`NETWORK_ERROR: ${err.message}`);
    }
  }

  async getDeactivationChallenge(deviceKeyId: string, licenseId: string): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/lifecycle/deactivation/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
        body: JSON.stringify({ deviceKeyId, licenseId }),
      });
      if (!res.ok) {
        throw new Error(`HTTP_${res.status}`);
      }
      const data = await res.json();
      return data;
    } catch (err: any) {
      throw new Error(`NETWORK_ERROR: ${err.message}`);
    }
  }

  async deactivate(
    requestId: string,
    licenseId: string,
    deviceKeyId: string,
    proof: ProofPayload
  ): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/lifecycle/deactivation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
        body: JSON.stringify({ requestId, licenseId, deviceKeyId, proof }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`HTTP_${res.status}: ${errorText}`);
      }
      
      const data = await res.json();
      return data;
    } catch (err: any) {
      if (err.message.startsWith('HTTP_')) {
        throw err;
      }
      throw new Error(`NETWORK_ERROR: ${err.message}`);
    }
  }
}
