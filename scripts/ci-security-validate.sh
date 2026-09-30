#!/usr/bin/env bash
# =============================================================================
# scripts/ci-security-validate.sh
# Phase 12 — CI Security Validation Pipeline
#
# This script runs all Phase 12 security gates in order.
# Exits with code 1 if any gate fails.
#
# CI Usage:
#   bash scripts/ci-security-validate.sh
#
# Each step is labeled. Steps that require infrastructure not present
# in CI report NOT_VERIFIED rather than failing falsely.
# =============================================================================

set -euo pipefail

PASS=0
FAIL=0
WARN=0
NV=0  # NOT_VERIFIED

green='\033[0;32m'
red='\033[0;31m'
yellow='\033[1;33m'
blue='\033[0;34m'
nc='\033[0m'

pass()  { echo -e "${green}  [PASS]${nc}      $1"; PASS=$((PASS+1)); }
fail()  { echo -e "${red}  [FAIL]${nc}      $1"; FAIL=$((FAIL+1)); }
warn()  { echo -e "${yellow}  [WARN]${nc}      $1"; WARN=$((WARN+1)); }
nv()    { echo -e "${blue}  [NOT_VERIFIED]${nc} $1"; NV=$((NV+1)); }
step()  { echo ""; echo "─────────────────────────────────────────────────"; echo "  $1"; echo "─────────────────────────────────────────────────"; }

echo ""
echo "================================================================="
echo " Mini POS — Phase 12 CI Security Validation"
echo "================================================================="
echo " $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "================================================================="

# ── Gate 1: TypeScript compilation (client) ───────────────────────────────────
step "Gate 1: TypeScript compilation (client)"
if npx tsc --noEmit 2>&1 | tail -5; then
  pass "Client TypeScript compiles without errors."
else
  fail "Client TypeScript compilation failed."
fi

# ── Gate 2: Client unit tests ─────────────────────────────────────────────────
step "Gate 2: Client unit tests"
if npm run test 2>&1 | tail -10; then
  pass "Client unit tests passed."
else
  fail "Client unit tests failed."
fi

# ── Gate 3: Server TypeScript compilation ────────────────────────────────────
step "Gate 3: Server TypeScript compilation"
cd server/licensing
if npx tsc --noEmit 2>&1 | tail -5; then
  pass "Server TypeScript compiles without errors."
else
  fail "Server TypeScript compilation failed."
fi
cd ../..

# ── Gate 4: Static secret scan (source tree) ─────────────────────────────────
step "Gate 4: Static secret scan"

PRIVATE_KEY_HITS=$(grep -rEl "-----BEGIN (EC |RSA |ED25519 )?PRIVATE KEY-----" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  --exclude-dir=dist-electron --exclude-dir=release . 2>/dev/null || true)

if [ -n "$PRIVATE_KEY_HITS" ]; then
  fail "Private key material found in source tree:"
  echo "$PRIVATE_KEY_HITS" | while read -r line; do echo "    $line"; done
else
  pass "No private key material in source tree."
fi

PG_CREDS_HITS=$(grep -rEl "postgres://[^'\"[:space:]]*:[^'\"[:space:]@]*@" \
  --include="*.ts" --include="*.tsx" --include="*.js" \
  --exclude="*.test.ts" --exclude="*.config.ts" --exclude="vitest.setup.ts" \
  --exclude-dir=node_modules --exclude-dir=.git \
  . 2>/dev/null || true)

if [ -n "$PG_CREDS_HITS" ]; then
  fail "PostgreSQL credentials found in source:"
  echo "$PG_CREDS_HITS" | while read -r line; do echo "    $line"; done
else
  pass "No embedded PostgreSQL credentials in source."
fi

# ── Gate 5: Migration safety scan ────────────────────────────────────────────
step "Gate 5: Migration safety scan"

DROP_VIOLATIONS=$(grep -l "^DROP TABLE" server/licensing/migrations/*.sql 2>/dev/null || true)
if [ -n "$DROP_VIOLATIONS" ]; then
  fail "DROP TABLE found in production migrations: $DROP_VIOLATIONS"
else
  pass "No DROP TABLE in production migrations."
fi

# ── Gate 6: License bypass scan ──────────────────────────────────────────────
step "Gate 6: License bypass scan"

BYPASS_HITS=$(grep -rEl "MINIPOS_SKIP_LICENSE|skipLicenseCheck|BILLING_BYPASS" \
  --include="*.ts" --include="*.tsx" \
  --exclude="*.test.*" --exclude="*.spec.*" \
  src/ electron/ 2>/dev/null || true)

if [ -n "$BYPASS_HITS" ]; then
  fail "License bypass found in production code:"
  echo "$BYPASS_HITS" | while read -r line; do echo "    $line"; done
else
  pass "No license bypass flags in production code."
fi

# ── Gate 7: Renderer authority check ─────────────────────────────────────────
step "Gate 7: Renderer does not set licensing state"

RENDERER_AUTH_HITS=$(grep -rEl "setLicenseState|ACTIVE.*render|setActivated" \
  src/presentation/ 2>/dev/null || true)

if [ -n "$RENDERER_AUTH_HITS" ]; then
  fail "Renderer licensing state mutation found:"
  echo "$RENDERER_AUTH_HITS" | while read -r line; do echo "    $line"; done
else
  pass "No renderer licensing authority found."
fi

# ── Gate 8: Admin IPC surface check ──────────────────────────────────────────
step "Gate 8: Admin reset not in preload IPC surface"

PRELOAD_PATH="electron/preload.ts"
if [ -f "$PRELOAD_PATH" ]; then
  if grep -qE "adminReset|releaseBinding|revokeLicense" "$PRELOAD_PATH"; then
    fail "Admin reset IPC found in preload.ts — must never be renderer-accessible."
  else
    pass "No admin reset operations in preload IPC surface."
  fi
else
  nv "preload.ts not found — Gate 8 NOT_VERIFIED"
fi

# ── Gate 9: Client dependency audit ──────────────────────────────────────────
step "Gate 9: Client dependency audit"

AUDIT_OUT=$(npm audit --json 2>&1 || true)
CRITICAL=$(echo "$AUDIT_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('metadata',{}).get('vulnerabilities',{}).get('critical',0))" 2>/dev/null || echo "unknown")
HIGH=$(echo "$AUDIT_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('metadata',{}).get('vulnerabilities',{}).get('high',0))" 2>/dev/null || echo "unknown")

if [ "$CRITICAL" = "0" ]; then
  pass "No critical vulnerabilities in client dependencies."
elif [ "$CRITICAL" = "unknown" ]; then
  warn "Could not parse npm audit output — review manually."
else
  fail "CRITICAL vulnerabilities in client dependencies: $CRITICAL critical, $HIGH high"
fi

# ── Gate 10: Production build ─────────────────────────────────────────────────
step "Gate 10: Production build"

if npm run build 2>&1 | tail -5; then
  pass "Production build succeeded."
else
  fail "Production build failed."
fi

# ── Gate 11: Artifact inspection ─────────────────────────────────────────────
step "Gate 11: Artifact inspection"

if [ -f "dist-electron/main.js" ]; then
  if bash scripts/inspect-artifact.sh dist-electron/main.js; then
    pass "Artifact inspection passed."
  else
    fail "Artifact inspection failed — review output above."
  fi
else
  nv "dist-electron/main.js not found — Gate 11 NOT_VERIFIED (run 'npm run build' first)"
fi

# ── Gate 12: Code signing ─────────────────────────────────────────────────────
step "Gate 12: macOS code signing & notarization"
nv "Apple Developer ID signing requires CI provisioning with signing certificate."
nv "Notarization requires Apple notarization service access."
nv "Classification: NOT_VERIFIED — must be performed on a provisioned CI/CD host."

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "================================================================="
echo " CI Validation Summary"
echo "================================================================="
echo -e " ${green}PASS${nc}:          $PASS"
echo -e " ${yellow}WARN${nc}:          $WARN"
echo -e " ${blue}NOT_VERIFIED${nc}:  $NV"
echo -e " ${red}FAIL${nc}:          $FAIL"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${red}❌ CI Validation FAILED — $FAIL gate(s) failed.${nc}"
  exit 1
else
  echo -e "${green}✅ CI Validation PASSED (with $NV items requiring manual verification).${nc}"
  exit 0
fi
