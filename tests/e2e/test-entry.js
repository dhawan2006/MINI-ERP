process.env.MINIPOS_E2E_TEST = 'true';
process.env.MINIPOS_E2E_TEST_DEVICE_KEY = 'test-device-id';
process.env.LICENSING_SERVER_KEY_ID = 'prod-ed25519-2026-10-01';
const crypto = require('crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
process.env.LICENSING_SERVER_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
Object.defineProperty(app, 'isPackaged', { get: () => false });

let userDataPath = null;
const userDataArg = process.argv.find(arg => arg.startsWith('--user-data-dir='));
if (userDataArg) {
  userDataPath = userDataArg.split('=')[1];
}

app.on('will-finish-launching', () => {
  if (!userDataPath) {
    userDataPath = app.getPath('userData');
  }
  if (process.env.SKIP_MOCK_LICENSE === 'true') {
    return; // Do not mock active license for setup tests
  }
  const authDir = path.join(userDataPath, 'licensing');
  fs.mkdirSync(authDir, { recursive: true });
  
  const payload = {
    protocolVersion: 1,
    authorizationVersion: 1,
    licenseId: "DEV-E2E-TEST",
    productId: "minipos-pro",
    deviceKeyId: "test-device-id",
    validFrom: "2020-01-01T00:00:00.000Z",
    validUntil: "2099-12-31T23:59:59.999Z",
    issuedAt: "2020-01-01T00:00:00.000Z",
    signingKeyId: "prod-ed25519-2026-10-01"
  };

  const payloadString = '{"authorizationVersion":1,"deviceKeyId":"test-device-id","issuedAt":"2020-01-01T00:00:00.000Z","licenseId":"DEV-E2E-TEST","productId":"minipos-pro","protocolVersion":1,"signingKeyId":"prod-ed25519-2026-10-01","validFrom":"2020-01-01T00:00:00.000Z","validUntil":"2099-12-31T23:59:59.999Z"}';
  const canonicalBytes = Buffer.from(payloadString, 'utf8');
  const domainSeparationTag = Buffer.from('MINIPOS-AUTHORIZATION-V1:', 'utf8');
  const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);
  
  const signatureBuffer = crypto.sign(null, dataToSign, privateKey);
  const signatureBase64url = signatureBuffer.toString('base64url');

  const authJson = {
    ...payload,
    signature: signatureBase64url
  };
  fs.writeFileSync(path.join(authDir, 'authorization.json'), JSON.stringify(authJson, null, 2));
});

require('../../dist-electron/main.js');
