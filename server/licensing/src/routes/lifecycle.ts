import { Router } from 'express';
import { z } from 'zod';
import { transaction } from '../config/db';
import { ChallengeService } from '../crypto/ChallengeService';
import { DeactivationService, DeactivationError } from '../services/DeactivationService';
import { ProductionDeviceProofVerifier } from '../crypto/deviceProof';

export const lifecycleRouter = Router();

const deactivationService = new DeactivationService(new ProductionDeviceProofVerifier());

const challengeSchema = z.object({
  deviceKeyId: z.string().min(1),
  licenseId: z.string().uuid()
});

lifecycleRouter.post('/deactivation/challenge', async (req, res, next) => {
  try {
    const { deviceKeyId, licenseId } = challengeSchema.parse(req.body);

    const challenge = await transaction(async (client) => {
      // Create a challenge specifically for deactivation
      return await ChallengeService.createChallenge(client, deviceKeyId, 'DEACTIVATION');
    });

    res.json(challenge);
  } catch (err) {
    next(err);
  }
});

const deactivationSchema = z.object({
  requestId: z.string().uuid(),
  licenseId: z.string().uuid(),
  deviceKeyId: z.string().min(1),
  proof: z.object({
    challenge: z.any(),
    signature: z.string()
  })
});

lifecycleRouter.post('/deactivation', async (req, res, next) => {
  try {
    const { requestId, licenseId, deviceKeyId, proof } = deactivationSchema.parse(req.body);

    const result = await transaction(async (client) => {
      return await deactivationService.executeDeactivation(
        client,
        requestId,
        licenseId,
        deviceKeyId,
        proof
      );
    });

    res.json(result);
  } catch (err: any) {
    if (err instanceof DeactivationError) {
      // 409 Conflict for idempotency reuse errors
      if (err.code === 'LIFECYCLE_REQUEST_CONFLICT') {
        return res.status(409).json({ error: err.code, message: err.message });
      }
      return res.status(400).json({ error: err.code, message: err.message });
    }
    next(err);
  }
});
