#!/bin/bash
set -e

export DATABASE_URL=postgres://laksh@localhost:5432/minipos_licensing_qa
export NODE_ENV=qa
export ADMIN_API_TOKEN=qa_admin_token_qa_admin_token_qa_admin_token_123
export LICENSE_KEY_HMAC_SECRET=qa_hmac_secret_qa_hmac_secret_qa_hmac_secret_123

cd server/licensing
npx tsx scripts/create-qa-license.ts
