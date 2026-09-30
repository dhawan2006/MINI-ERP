// ---------------------------------------------------------------------------
// Activation Route
//
// POST /api/v1/activation/challenge  — issue a device challenge
// POST /api/v1/activation            — complete activation with proof
//
// Phase 12 hardening:
//  - All inputs strictly validated via Zod before business logic
//  - Deactivation verification aligned with lifecycle router pattern
//  - Correlation ID threading from app.ts middleware
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { z } from 'zod';
import { transaction } from '../config/db';
import { ChallengeService } from '../crypto/ChallengeService';
import { ActivationService } from '../services/ActivationService';
import { ActivationError } from '../services/ActivationService';
import { ProductionDeviceProofVerifier } from '../crypto/deviceProof';
import { ServerAuthorizationSigner } from '../crypto/ServerAuthorizationSigner';
import { config } from '../config/config';

export const activationRouter = Router();

// Wire up the signer using the configured server private key and key ID.
// This isolates key material loading to this initialization point.
const signer = new ServerAuthorizationSigner();
signer.registerKey(config.LICENSING_SERVER_KEY_ID, config.LICENSING_SERVER_PRIVATE_KEY);

const activationService = new ActivationService(
  new ProductionDeviceProofVerifier(),
  signer,
  config.LICENSING_SERVER_KEY_ID
);

// ---------------------------------------------------------------------------
// Strict input schemas — validated before any business logic executes
// ---------------------------------------------------------------------------
const challengeRequestSchema = z.object({
  deviceKeyId: z.string().min(1).max(255),
});

const activationRequestSchema = z.object({
  requestId: z.string().uuid(),
  licenseKey: z.string().min(10).max(128),
  deviceKeyId: z.string().min(1).max(255),
  publicKey: z.string().min(10).max(512), // base64url encoded P-256 uncompressed point
  deviceProof: z.object({
    challenge: z.any(),
    signature: z.string().min(1).max(512),
  }),
});

// ---------------------------------------------------------------------------
// POST /api/v1/activation/challenge
// ---------------------------------------------------------------------------
activationRouter.post('/challenge', async (req, res, next) => {
  try {
    const { deviceKeyId } = challengeRequestSchema.parse(req.body);

    const challenge = await transaction(async (client) => {
      return await ChallengeService.createChallenge(client, deviceKeyId, 'ACTIVATION');
    });

    res.json(challenge);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/activation
// ---------------------------------------------------------------------------
activationRouter.post('/', async (req, res, next) => {
  try {
    const { requestId, licenseKey, deviceKeyId, publicKey, deviceProof } =
      activationRequestSchema.parse(req.body);

    const result = await transaction(async (client) => {
      return await activationService.executeActivation(
        client,
        requestId,
        licenseKey,
        deviceKeyId,
        publicKey,
        deviceProof
      );
    });

    res.json(result);
  } catch (err: any) {
    if (err instanceof ActivationError) {
      const status = err.code === 'ACTIVATION_REQUEST_CONFLICT' ? 409 : 400;
      return res.status(status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
});
