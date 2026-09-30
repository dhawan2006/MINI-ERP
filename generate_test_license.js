const crypto = require('crypto');
const fs = require('fs');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

const DN = (e) => {
    const wN = (e, t) => {
        if (typeof e !== 'object' || !e) return JSON.stringify(e);
        if (Array.isArray(e)) return `[${e.map(x => wN(x, t)).join(',')}]`;
        const keys = Object.keys(e).sort();
        return `{${keys.map(k => `"${k}":${wN(e[k], t)}`).join(',')}}`;
    };
    return wN(e, new Set());
};

const payload = {
    protocolVersion: 1,
    authorizationVersion: 1,
    licenseId: "DEV-E2E-TEST",
    productId: "minipos-pro",
    deviceKeyId: "test-device-id",
    validFrom: "2020-01-01T00:00:00.000Z",
    validUntil: "2099-12-31T23:59:59.999Z",
    issuedAt: "2020-01-01T00:00:00.000Z",
    signingKeyId: "test-key-1"
};

const payloadStr = DN(payload);
const prefix = Buffer.from('MINIPOS-AUTHORIZATION-V1:', 'utf8');
const data = Buffer.from(payloadStr, 'utf8');
const message = Buffer.concat([prefix, data]);
const signature = crypto.sign(null, message, privateKey).toString('base64url');

const authJson = {
    ...payload,
    signature
};

console.log('PUBLIC KEY:');
console.log(pubKeyPem);
console.log('\nAUTH JSON:');
console.log(JSON.stringify(authJson, null, 2));
