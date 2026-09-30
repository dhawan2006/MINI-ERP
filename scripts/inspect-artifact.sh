#!/usr/bin/env bash
# =============================================================================
# scripts/inspect-artifact.sh
# Phase 12 — Production Artifact Security Inspection
#
# Usage:  bash scripts/inspect-artifact.sh [path-to-.app-or-main.js]
#
# Examples:
#   bash scripts/inspect-artifact.sh                         # auto-detect built .app
#   bash scripts/inspect-artifact.sh dist-electron/main.js  # check dev build JS
#   bash scripts/inspect-artifact.sh release/Mac/Mini\ POS.app
#
# What this checks:
#   1. Test activation credentials are NOT present in the bundled JS
#   2. Server private signing key is NOT present in the artifact
#   3. PostgreSQL credentials are NOT embedded
#   4. No raw admin API key values in bundled JS
#   5. No E2E test bypass flag in bundled renderer JS
#   6. No MINIPOS_SKIP_LICENSE or equivalent bypasses
#   7. No localhost licensing server URL hardcoded in bundle
#   8. Preload IPC surface does not expose admin operations
# =============================================================================

set -euo pipefail

PASS=0
FAIL=0
WARN=0

green='\033[0;32m'
red='\033[0;31m'
yellow='\033[1;33m'
nc='\033[0m'

pass()  { echo -e "${green}  PASS${nc}  $1"; PASS=$((PASS+1)); }
fail()  { echo -e "${red}  FAIL${nc}  $1"; FAIL=$((FAIL+1)); }
warn()  { echo -e "${yellow}  WARN${nc}  $1"; WARN=$((WARN+1)); }
info()  { echo -e "  INFO  $1"; }

# Use grep for text-based JS/JSON files, strings for native binaries
search_file() {
  local file="$1"; local pattern="$2"
  if file "$file" | grep -q "text"; then
    grep -q "$pattern" "$file" 2>/dev/null
  else
    strings "$file" 2>/dev/null | grep "$pattern" >/dev/null
  fi
}
search_file_e() {
  local file="$1"; local pattern="$2"
  if file "$file" | grep -q "text"; then
    grep -qE "$pattern" "$file" 2>/dev/null
  else
    strings "$file" 2>/dev/null | grep -E "$pattern" >/dev/null
  fi
}

echo ""
echo "================================================================="
echo " Mini POS — Production Artifact Security Inspection"
echo " Phase 12 Hardened Version"
echo "================================================================="
echo ""

# ── Resolve artifact path ─────────────────────────────────────────────────────
if [ -n "${1:-}" ]; then
  ARTIFACT_PATH="$1"
else
  ARTIFACT_PATH=$(find release -name "*.app" 2>/dev/null | head -n 1)
  if [ -z "$ARTIFACT_PATH" ]; then
    echo "No packaged .app found in release/. Running against dist-electron/main.js..."
    ARTIFACT_PATH="dist-electron/main.js"
  fi
fi

if [ -f "$ARTIFACT_PATH" ]; then
  MAIN_JS="$ARTIFACT_PATH"
  NATIVE_BINARY="assets/native/minipos-identity"
elif [ -d "$ARTIFACT_PATH" ]; then
  MAIN_JS="$ARTIFACT_PATH/Contents/Resources/app.asar"
  NATIVE_BINARY="$ARTIFACT_PATH/Contents/Resources/native/minipos-identity"
else
  echo "ERROR: Artifact not found at: $ARTIFACT_PATH"
  exit 1
fi

info "Inspecting: $ARTIFACT_PATH"
echo ""

# ── Check 1: Test activation code ─────────────────────────────────────────────
echo "--- Check 1: Test activation code must NOT be in bundled JS ---"
if search_file "$MAIN_JS" "MPOS-ABCDE-12345-VWXYZ"; then
  fail "TEST ACTIVATION CODE 'MPOS-ABCDE-12345-VWXYZ' found in bundled JS!"
  fail "This is a development-only key and must never ship in production artifacts."
else
  pass "Test activation code is NOT in bundled JS."
fi

# ── Check 2: Server private signing key ───────────────────────────────────────
echo ""
echo "--- Check 2: Server private signing key must NOT be in artifact ---"
if search_file_e "$MAIN_JS" "MC4CAQ|BEGIN PRIVATE KEY|BEGIN EC PRIVATE KEY"; then
  fail "Possible private key material detected in bundled JS! Inspect manually."
else
  pass "No private key PEM/DER material found in bundled JS."
fi

# ── Check 3: PostgreSQL credentials ───────────────────────────────────────────
echo ""
echo "--- Check 3: PostgreSQL credentials must NOT be embedded ---"
if search_file_e "$MAIN_JS" "postgres://[^'\"[:space:]]*:[^'\"[:space:]@]*@"; then
  fail "PostgreSQL connection string with credentials found in bundled JS!"
else
  pass "No hardcoded PostgreSQL credentials in bundled JS."
fi

# ── Check 4: Admin credentials ────────────────────────────────────────────────
echo ""
echo "--- Check 4: Admin credentials must NOT be embedded ---"
if search_file_e "$MAIN_JS" "ADMIN_API_TOKEN=[A-Za-z0-9]|ADMIN_API_KEY=[A-Za-z0-9]"; then
  fail "Possible admin API key value embedded in bundled JS!"
else
  pass "No embedded admin API key values found in bundled JS."
fi

# ── Check 5: E2E test bypass in renderer bundle ───────────────────────────────
echo ""
echo "--- Check 5: E2E test bypass (MINIPOS_E2E_TEST) must NOT gate renderer behavior ---"
# The renderer itself must not condition on MINIPOS_E2E_TEST.
# (It's acceptable in electron/main.ts — this checks the renderer bundle.)
RENDERER_JS=""
if [ -d "$ARTIFACT_PATH" ]; then
  RENDERER_JS="$ARTIFACT_PATH/Contents/Resources/app.asar"
elif [ -f "dist/assets" ] 2>/dev/null; then
  RENDERER_JS=$(find dist/assets -name "*.js" | head -1)
fi

if [ -n "$RENDERER_JS" ] && [ -f "$RENDERER_JS" ]; then
  if search_file "$RENDERER_JS" "MINIPOS_E2E_TEST"; then
    warn "MINIPOS_E2E_TEST string found in renderer bundle. Verify it is not in renderer-executed code."
  else
    pass "MINIPOS_E2E_TEST not found in renderer bundle."
  fi
else
  warn "Could not locate renderer JS bundle for Check 5 — NOT VERIFIED"
fi

# ── Check 6: License bypass flags ─────────────────────────────────────────────
echo ""
echo "--- Check 6: License bypass flags must NOT be in artifact ---"
if search_file_e "$MAIN_JS" "MINIPOS_SKIP_LICENSE|skipLicenseCheck|BILLING_BYPASS"; then
  fail "License bypass flag found in bundled JS!"
else
  pass "No license bypass flags found in bundled JS."
fi

# ── Check 7: Hardcoded localhost licensing server ─────────────────────────────
echo ""
echo "--- Check 7: Hardcoded localhost licensing server URL must NOT be default ---"
# The client may read LICENSING_SERVER_URL from env, but must not hardcode localhost
# as the only option. The check looks for it as a literal default.
if search_file_e "$MAIN_JS" "localhost:3000|127\.0\.0\.1:3000"; then
  warn "localhost:3000 found in bundle. Verify LICENSING_SERVER_URL has a production default or is always externally configured."
else
  pass "No hardcoded localhost licensing server URL found."
fi

# ── Check 8: Preload IPC surface ─────────────────────────────────────────────
echo ""
echo "--- Check 8: Admin reset operations must NOT be in preload IPC surface ---"
PRELOAD_JS=""
if [ -d "$ARTIFACT_PATH" ]; then
  PRELOAD_JS=$(find "$ARTIFACT_PATH/Contents/Resources" -name "preload.js" 2>/dev/null | head -n 1)
elif [ -f "dist-electron/preload.js" ]; then
  PRELOAD_JS="dist-electron/preload.js"
fi

if [ -n "$PRELOAD_JS" ] && [ -f "$PRELOAD_JS" ]; then
  if search_file_e "$PRELOAD_JS" "adminReset|releaseBinding|revokeLicense"; then
    fail "Admin reset IPC found in preload.js! This must never be renderer-accessible."
  else
    pass "No admin reset operations found in preload IPC surface."
  fi
else
  warn "Could not locate preload.js for Check 8 — NOT VERIFIED (run 'npm run build' first)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "================================================================="
echo " Inspection Summary"
echo "================================================================="
echo -e " ${green}PASS${nc}: $PASS"
echo -e " ${yellow}WARN${nc}: $WARN"
echo -e " ${red}FAIL${nc}: $FAIL"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${red}❌ Inspection FAILED — fix the above issues before shipping.${nc}"
  exit 1
else
  echo -e "${green}✅ Inspection PASSED.${nc}"
  echo ""
  echo " Security statement (Phase 12):"
  echo "   Mini POS enforces licensing via cryptographic authorization."
  echo "   The Main process is the sole billing authority."
  echo "   The renderer cannot authorize billing or set licensing state."
  echo "   Server private signing keys are NOT present in the client artifact."
  echo "   Admin credentials are NOT present in the client artifact."
  exit 0
fi
