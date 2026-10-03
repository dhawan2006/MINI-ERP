require('dotenv').config({ path: 'server/licensing/.env' });
console.log(process.env.LICENSE_KEY_HMAC_SECRET);
