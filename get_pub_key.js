const crypto = require('crypto');
const privKeyPem = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIPoT8zV9Q9dZ3w+9nQoH9P+6187f54pLg64c4c2m/Q1S
-----END PRIVATE KEY-----`;

const privKey = crypto.createPrivateKey(privKeyPem);
const pubKey = crypto.createPublicKey(privKey);
console.log(pubKey.export({ type: 'spki', format: 'pem' }));
