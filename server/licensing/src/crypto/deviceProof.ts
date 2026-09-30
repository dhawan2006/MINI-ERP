import { PoolClient } from 'pg';
import { DeviceProofVerifier } from './DeviceProofVerifier';

export interface IDeviceProofVerifier {
  verify(
    client: PoolClient,
    proof: any,
    devicePublicKeyBase64url: string,
    expectedDeviceKeyId: string,
    expectedPurpose: string
  ): Promise<void>;
}

export class ProductionDeviceProofVerifier implements IDeviceProofVerifier {
  async verify(
    client: PoolClient,
    proof: any,
    devicePublicKeyBase64url: string,
    expectedDeviceKeyId: string,
    expectedPurpose: string
  ): Promise<void> {
    await DeviceProofVerifier.verifyAndConsume(
      client,
      proof,
      devicePublicKeyBase64url,
      expectedDeviceKeyId,
      expectedPurpose
    );
  }
}

/**
 * Test-only verifier that bypasses cryptography for database transaction tests.
 */
export class TestDeviceProofVerifier implements IDeviceProofVerifier {
  async verify(
    client: PoolClient,
    proof: any,
    devicePublicKeyBase64url: string,
    expectedDeviceKeyId: string,
    expectedPurpose: string
  ): Promise<void> {
    if (proof?.signature !== 'test-valid-signature') {
      throw new Error('DEVICE_PROOF_INVALID');
    }
  }
}
