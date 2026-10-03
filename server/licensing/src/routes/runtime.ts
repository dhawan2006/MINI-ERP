import { Router, Request, Response } from 'express';
import { transaction } from '../config/db';
import { ChallengeService } from '../crypto/ChallengeService';
import { RuntimeCheckinService, RuntimeCheckinError } from '../services/RuntimeCheckinService';
import { config } from '../config/config';
import { ServerAuthorizationSigner } from '../crypto/ServerAuthorizationSigner';
import { CryptoError } from '../../../../src/shared/crypto/cryptoError';
import { ProductionDeviceProofVerifier } from '../crypto/deviceProof';

export const runtimeRouter = Router();

// Setup services
const signer = new ServerAuthorizationSigner();
if (config.LICENSING_SERVER_PRIVATE_KEY) {
  signer.registerKey(config.LICENSING_SERVER_KEY_ID || 'default-key-1', config.LICENSING_SERVER_PRIVATE_KEY);
}
const verifier = new ProductionDeviceProofVerifier();
const runtimeCheckinService = new RuntimeCheckinService(verifier, signer, config.LICENSING_SERVER_KEY_ID || 'default-key-1');

runtimeRouter.post('/checkin/challenge', async (req: Request, res: Response) => {
  const { deviceKeyId } = req.body;
  if (!deviceKeyId || typeof deviceKeyId !== 'string') {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Invalid deviceKeyId' });
  }

  try {
    const challenge = await transaction(async (client) => {
      return await ChallengeService.createChallenge(client, deviceKeyId, 'RUNTIME_CHECKIN');
    });
    res.json(challenge);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An internal server error occurred' });
  }
});

runtimeRouter.post('/checkin', async (req: Request, res: Response) => {
  const { requestId, licenseId, deviceKeyId, publicKey, proof } = req.body;
  if (!requestId || typeof requestId !== 'string') {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Invalid requestId' });
  }

  try {
    const result = await transaction(async (client) => {
      return await runtimeCheckinService.executeCheckin(client, requestId, licenseId, deviceKeyId, publicKey, proof);
    });
    res.json(result);
  } catch (err: any) {
    if (err instanceof RuntimeCheckinError || err.name === 'RuntimeCheckinError') {
      const status = err.code === 'CHECKIN_REQUEST_CONFLICT' ? 409 : 400;
      return res.status(status).json({ error: err.code, message: err.message });
    }
    if (err instanceof CryptoError || err.name === 'CryptoError') {
      return res.status(400).json({ error: 'DEVICE_PROOF_INVALID', message: err.message });
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An internal server error occurred' });
  }
});

runtimeRouter.post('/directives/:id/acknowledge', async (req: Request, res: Response) => {
  const directiveId = req.params.id;
  const { receiptId } = req.body;
  
  if (!directiveId) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Invalid directiveId' });
  }
  if (!receiptId) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Invalid receiptId' });
  }

  try {
    await transaction(async (client) => {
      await client.query(`
        UPDATE runtime_directives 
        SET status = 'ACKNOWLEDGED' 
        WHERE directive_id = $1 AND status = 'DELIVERED'
      `, [directiveId]);
      await client.query(`
        UPDATE runtime_directive_deliveries 
        SET status = 'ACKNOWLEDGED', acknowledged_at = NOW() 
        WHERE directive_id = $1 AND receipt_id = $2
      `, [directiveId, receiptId]);
      await client.query(`
        INSERT INTO audit_events (event_type, details)
        VALUES ('RUNTIME_DIRECTIVE_ACKNOWLEDGED', $1)
      `, [{ directiveId, receiptId }]);
    });
    res.json({ status: 'SUCCESS' });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An internal server error occurred' });
  }
});
