import { handleCors, corsHeaders } from '../_shared/http/cors.ts';
import { getDb } from '../_shared/database/db.ts';
import { ChallengeService } from '../_shared/crypto/ChallengeService.ts';
import { ActivationService } from '../_shared/services/ActivationService.ts';
import { DeactivationService, DeactivationError } from '../_shared/services/DeactivationService.ts';
import { CryptoError } from '../_shared/errors/CryptoError.ts';

let activationService: ActivationService | null = null;
let deactivationService: DeactivationService | null = null;

async function getActivationService() {
  if (activationService) return activationService;
  const { DenoServerAuthorizationSigner } = await import('../_shared/crypto/authorization.ts');
  const privateKeyPem = Deno.env.get('LICENSING_SERVER_PRIVATE_KEY');
  if (!privateKeyPem) throw new Error('Missing LICENSING_SERVER_PRIVATE_KEY');
  const keyId = Deno.env.get('LICENSING_SERVER_KEY_ID') || 'default-key-1';
  const signer = new DenoServerAuthorizationSigner();
  await signer.registerKey(keyId, privateKeyPem);
  activationService = new ActivationService(signer, keyId);
  return activationService;
}

async function getDeactivationService() {
  if (deactivationService) return deactivationService;
  deactivationService = new DeactivationService();
  return deactivationService;
}

let runtimeCheckinService: any = null;

async function getRuntimeCheckinService() {
  if (runtimeCheckinService) return runtimeCheckinService;
  const { DenoServerAuthorizationSigner } = await import('../_shared/crypto/authorization.ts');
  const privateKeyPem = Deno.env.get('LICENSING_SERVER_PRIVATE_KEY');
  if (!privateKeyPem) throw new Error('Missing LICENSING_SERVER_PRIVATE_KEY');
  const keyId = Deno.env.get('LICENSING_SERVER_KEY_ID') || 'default-key-1';
  const signer = new DenoServerAuthorizationSigner();
  await signer.registerKey(keyId, privateKeyPem);
  const { RuntimeCheckinService } = await import('../_shared/services/RuntimeCheckinService.ts');
  runtimeCheckinService = new RuntimeCheckinService(signer, keyId);
  return runtimeCheckinService;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const bodyText = await req.text();
    let body: any;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ error: 'Bad Request', message: 'Malformed JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const sql = getDb();

    // ---------------------------------------------------------------------------
    // POST /v1/activation/challenge
    // ---------------------------------------------------------------------------
    if (path.endsWith('/v1/activation/challenge')) {
      const { deviceKeyId } = body;
      if (!deviceKeyId || typeof deviceKeyId !== 'string' || deviceKeyId.length < 1 || deviceKeyId.length > 255) {
        return new Response(JSON.stringify({ error: 'INVALID_REQUEST', message: 'Invalid deviceKeyId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const challenge = await sql.begin(async (tx) => {
        return await ChallengeService.createChallenge(tx, deviceKeyId, 'ACTIVATION');
      });

      return new Response(JSON.stringify(challenge), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ---------------------------------------------------------------------------
    // POST /v1/activation
    // ---------------------------------------------------------------------------
    if (path.endsWith('/v1/activation')) {
      const { requestId, licenseKey, deviceKeyId, publicKey, deviceProof, deviceName } = body;

      if (!requestId || typeof requestId !== 'string' || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(requestId)) {
        return new Response(JSON.stringify({ error: 'INVALID_REQUEST', message: 'Invalid requestId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const service = await getActivationService();
      const result = await sql.begin(async (tx) => {
        return await service.executeActivation(tx, requestId, licenseKey, deviceKeyId, publicKey, deviceProof, deviceName);
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ---------------------------------------------------------------------------
    // POST /v1/lifecycle/deactivation/challenge
    // ---------------------------------------------------------------------------
    if (path.endsWith('/v1/lifecycle/deactivation/challenge')) {
      const { deviceKeyId, licenseId } = body;
      
      if (!deviceKeyId || typeof deviceKeyId !== 'string') {
        return new Response(JSON.stringify({ error: 'INVALID_REQUEST', message: 'Invalid deviceKeyId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!licenseId || typeof licenseId !== 'string') {
        return new Response(JSON.stringify({ error: 'INVALID_REQUEST', message: 'Invalid licenseId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const challenge = await sql.begin(async (tx) => {
        return await ChallengeService.createChallenge(tx, deviceKeyId, 'DEACTIVATION');
      });

      return new Response(JSON.stringify(challenge), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ---------------------------------------------------------------------------
    // POST /v1/lifecycle/deactivation
    // ---------------------------------------------------------------------------
    if (path.endsWith('/v1/lifecycle/deactivation')) {
      const { requestId, licenseId, deviceKeyId, proof } = body;

      if (!requestId || typeof requestId !== 'string') {
        return new Response(JSON.stringify({ error: 'INVALID_REQUEST', message: 'Invalid requestId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const service = await getDeactivationService();

      const result = await sql.begin(async (tx) => {
        return await service.executeDeactivation(tx, requestId, licenseId, deviceKeyId, proof);
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ---------------------------------------------------------------------------
    // POST /v1/runtime/checkin/challenge
    // ---------------------------------------------------------------------------
    if (path.endsWith('/v1/runtime/checkin/challenge')) {
      const { deviceKeyId } = body;
      if (!deviceKeyId || typeof deviceKeyId !== 'string') {
        return new Response(JSON.stringify({ error: 'INVALID_REQUEST', message: 'Invalid deviceKeyId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const challenge = await sql.begin(async (tx) => {
        return await ChallengeService.createChallenge(tx, deviceKeyId, 'RUNTIME_CHECKIN');
      });

      return new Response(JSON.stringify(challenge), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ---------------------------------------------------------------------------
    // POST /v1/runtime/checkin
    // ---------------------------------------------------------------------------
    if (path.endsWith('/v1/runtime/checkin')) {
      const { requestId, licenseId, deviceKeyId, publicKey, proof } = body;
      if (!requestId || typeof requestId !== 'string') {
        return new Response(JSON.stringify({ error: 'INVALID_REQUEST', message: 'Invalid requestId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const service = await getRuntimeCheckinService();
      const result = await sql.begin(async (tx) => {
        return await service.executeCheckin(tx, requestId, licenseId, deviceKeyId, publicKey, proof);
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ---------------------------------------------------------------------------
    // POST /v1/runtime/directives/:id/acknowledge
    // ---------------------------------------------------------------------------
    if (path.match(/\/v1\/runtime\/directives\/([a-zA-Z0-9-]+)\/acknowledge$/)) {
      const match = path.match(/\/v1\/runtime\/directives\/([a-zA-Z0-9-]+)\/acknowledge$/);
      const directiveId = match ? match[1] : null;
      if (!directiveId) {
        return new Response(JSON.stringify({ error: 'INVALID_REQUEST', message: 'Invalid directiveId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      const { receiptId } = body;
      if (!receiptId) {
        return new Response(JSON.stringify({ error: 'INVALID_REQUEST', message: 'Invalid receiptId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await sql.begin(async (tx) => {
        await tx`
          UPDATE runtime_directives 
          SET status = 'ACKNOWLEDGED' 
          WHERE directive_id = ${directiveId} AND status = 'DELIVERED'
        `;
        await tx`
          UPDATE runtime_directive_deliveries 
          SET status = 'ACKNOWLEDGED', acknowledged_at = NOW() 
          WHERE directive_id = ${directiveId} AND receipt_id = ${receiptId}
        `;
        await tx`
          INSERT INTO audit_events (event_type, details)
          VALUES ('RUNTIME_DIRECTIVE_ACKNOWLEDGED', ${ { directiveId, receiptId } })
        `;
      });

      return new Response(JSON.stringify({ status: 'SUCCESS' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    if (err.name === 'ActivationError') {
      const status = err.code === 'ACTIVATION_REQUEST_CONFLICT' ? 409 : 400;
      return new Response(JSON.stringify({ error: err.code, message: err.message }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (err instanceof DeactivationError) {
      const status = err.code === 'LIFECYCLE_REQUEST_CONFLICT' ? 409 : 400;
      return new Response(JSON.stringify({ error: err.code, message: err.message }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (err instanceof CryptoError) {
      return new Response(JSON.stringify({ error: 'DEVICE_PROOF_INVALID', message: err.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (err.name === 'RuntimeCheckinError') {
      const status = err.code === 'CHECKIN_REQUEST_CONFLICT' ? 409 : 400;
      return new Response(JSON.stringify({ error: err.code, message: err.message }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.error('Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR', message: 'An internal server error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
