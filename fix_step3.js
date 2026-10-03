const fs = require('fs');
const path = 'tests/e2e/licensing-real/step3-runtime-checkin.spec.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/LICENSING_SERVER_URL:\s*'http:\/\/localhost:3456'/g, "LICENSING_SERVER_URL: 'http://localhost:54321/functions/v1/api'");
code = code.replace(/LICENSING_SERVER_KEY_ID:\s*'qa-key-1'/g, "LICENSING_SERVER_KEY_ID: 'test-key-id'");

// And I must provide the correct public key for the Edge Function!
const pubKey = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA1bvN09iwd2BQjy86eLX9inVXjvZP5CwhsGuiJ9ge6AU=
-----END PUBLIC KEY-----`;

code = code.replace(/publicKeyPem = fs\.readFileSync\(path\.join\(process\.cwd\(\), '\.local-qa', 'signing', 'qa-public-key\.pem'\), 'utf8'\);/g, "publicKeyPem = `" + pubKey + "`;");

fs.writeFileSync(path, code);
