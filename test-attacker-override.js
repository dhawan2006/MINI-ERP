const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const attackerPubKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
const attackerPrivKey = privateKey;

// Craft an attacker-signed authorization
const payload = {
  protocolVersion: 1,
  authorizationVersion: 1,
  licenseId: "ATTACKER-LICENSE",
  productId: "minipos-pro",
  deviceKeyId: "e7dd078265e3", // matching what the log output earlier
  validFrom: "2020-01-01T00:00:00.000Z",
  validUntil: "2099-12-31T23:59:59.999Z",
  issuedAt: "2020-01-01T00:00:00.000Z",
  signingKeyId: "qa-key-1"
};

const payloadString = JSON.stringify(payload, Object.keys(payload).sort());
const canonicalBytes = Buffer.from(payloadString, 'utf8');
const domainSeparationTag = Buffer.from('MINIPOS-AUTHORIZATION-V1:', 'utf8');
const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);

const signatureBuffer = crypto.sign(null, dataToSign, attackerPrivKey);
const signatureBase64url = signatureBuffer.toString('base64url');

const authJson = {
  ...payload,
  signature: signatureBase64url
};

const authDir = path.join(os.homedir(), 'Library/Application Support/Mini POS/licensing');
fs.mkdirSync(authDir, { recursive: true });
fs.writeFileSync(path.join(authDir, 'authorization.json'), JSON.stringify(authJson, null, 2));

console.log("ATTACKER_PUB_KEY:\n" + attackerPubKeyPem);
