#!/bin/bash
set -e

export LICENSING_SERVER_URL="http://localhost:3456"
export LICENSING_SERVER_KEY_ID="qa-key-1"
export LICENSING_SERVER_PUBLIC_KEY="$(cat .local-qa/signing/qa-public-key.pem)"

echo "Starting Mini POS connected to local QA server..."
npm run dev
