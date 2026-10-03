import { LicensingClient } from '../../../electron/licensing/LicensingClient';
import { AuthorizationVerifier } from '../../../src/shared/crypto/AuthorizationVerifier';

const PROD_SERVER_URL = 'https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1';
const client = new LicensingClient(PROD_SERVER_URL);

async function run() {
  console.log('Testing Production Edge Function Signing...');
  
  const licenseKey = process.env.TEST_LICENSE_KEY;
  if (!licenseKey) throw new Error('TEST_LICENSE_KEY is required');

  const deviceKeyId = 'prod-test-device-123';

  console.log('1. Getting challenge...');
  const challengeData = await client.getChallenge(deviceKeyId);
  console.log('Challenge:', challengeData);

  console.log('2. Generating proof...');
  const crypto = require('crypto');
  const kp = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spkiDer = kp.publicKey.export({ type: 'spki', format: 'der' });
  const rawPubKey = spkiDer.subarray(-65);
  const rawPubKeyBase64url = rawPubKey.toString('base64url');
  
  const { canonicalize } = require('../../../src/shared/crypto/canonicalize');
  const canonicalBytes = Buffer.from(canonicalize(challengeData), 'utf8');
  const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
  const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);
  const sig = crypto.sign(null, dataToSign, kp.privateKey).toString('base64url');

  const proof = {
    challenge: challengeData,
    signature: sig
  };

  console.log('3. Activating...');
  const authorization = await client.activate(licenseKey, deviceKeyId, rawPubKeyBase64url, proof, 'Prod Test Device');
  
  console.log('Activation successful. Authorization received.');
  console.log('Authorization details:', JSON.stringify(authorization, null, 2));

  console.log('4. Verifying production signature...');
  const TRUST_ANCHOR = 'MCowBQYDK2VwAyEAqWLnyyr1UFeDvp7o+6+NRnjS6doOjBRtx8+7GyCMOZk='; 
  
  try {
    const verifier = new AuthorizationVerifier();
    verifier.registerTrustedKey('prod-ed25519-2026-10-01', `-----BEGIN PUBLIC KEY-----\n${TRUST_ANCHOR}\n-----END PUBLIC KEY-----`);
    
    verifier.verify(authorization);
    console.log('Live production verification SUCCESS!');
    
    console.log('5. Running negative signature test (Attacker Key)...');
    const attackerVerifier = new AuthorizationVerifier();
    const ATTACKER_KEY = 'MCowBQYDK2VwAyEA2HpuHiMmLfL9Kk7SHOzEAqNe7c2v1v3RBXSxUpNcp+c=';
    attackerVerifier.registerTrustedKey('prod-ed25519-2026-10-01', `-----BEGIN PUBLIC KEY-----\n${ATTACKER_KEY}\n-----END PUBLIC KEY-----`);
    
    try {
      attackerVerifier.verify(authorization);
      throw new Error('Negative test failed: attacker signature was accepted!');
    } catch (e: any) {
      if (e.message.includes('Signature verification failed')) {
         console.log('Negative signature test SUCCESS (attacker signature rejected).');
      } else {
         throw e;
      }
    }

  } catch (err) {
    console.error('Live production verification FAILED:', err);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
