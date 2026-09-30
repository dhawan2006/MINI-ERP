import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Phase 12 — Production Configuration Schema
//
// SECURITY RULES:
//  - Security-critical values required in production with no insecure default.
//  - NODE_ENV=production enforces stricter subset checks via cross-field validation.
//  - Config is validated once at startup; process exits immediately on failure.
//  - Secrets are NEVER logged here; only structure/presence is reported.
//  - In development/test, signing key fields are optional (tests generate
//    ephemeral keys themselves); in production they are required.
// ---------------------------------------------------------------------------

const configSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'test', 'qa', 'production']).default('development'),

  // Network
  PORT: z.string().regex(/^\d+$/).default('3000'),

  // Database
  DATABASE_URL: z.string().url(),

  // Admin Authentication
  // ADMIN_API_TOKEN is the canonical name. ADMIN_API_KEY was previously used
  // in adminAuth.ts — that inconsistency is corrected in Phase 12.
  ADMIN_API_TOKEN: z.string().min(32),

  // License key HMAC secret — one-way hash of license keys before DB storage.
  LICENSE_KEY_HMAC_SECRET: z.string().min(32),

  // Server Authorization Signing Key (OPTIONAL in dev/test — required in production).
  // In dev/test, individual routes/tests generate ephemeral keys.
  // In production, this MUST be set via secret management — never hardcoded.
  LICENSING_SERVER_PRIVATE_KEY: z.string().min(64).optional(),

  // The stable Key ID (kid) for the current signing key.
  // Must match the kid registered in the Electron client's trusted key set.
  LICENSING_SERVER_KEY_ID: z.string().min(1).optional(),

  // CORS — comma-separated list of allowed origins in production.
  // Leave blank in development to allow all origins.
  ALLOWED_ORIGINS: z.string().optional(),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid server configuration. Review the following fields:');
  const issues = parsed.error.issues;
  for (const issue of issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  const errorMsg = issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
  if (process.env.NODE_ENV === 'test') {
    throw new Error(`Config validation failed: ${errorMsg}`);
  }
  process.exit(1);
}

const raw = parsed.data;

// ---------------------------------------------------------------------------
// Production-specific cross-field invariants
// ---------------------------------------------------------------------------
if (raw.NODE_ENV === 'production') {
  // Signing key is REQUIRED in production
  if (!raw.LICENSING_SERVER_PRIVATE_KEY || raw.LICENSING_SERVER_PRIVATE_KEY.length < 64) {
    console.error('❌ Production startup rejected: LICENSING_SERVER_PRIVATE_KEY is required and must be at least 64 chars.');
    process.exit(1);
  }
  if (!raw.LICENSING_SERVER_KEY_ID) {
    console.error('❌ Production startup rejected: LICENSING_SERVER_KEY_ID is required.');
    process.exit(1);
  }

  // Guard against accidentally using a localhost database in production
  if (raw.DATABASE_URL.includes('localhost') || raw.DATABASE_URL.includes('127.0.0.1')) {
    console.error('❌ Production startup rejected: DATABASE_URL points to localhost.');
    console.error('   A production server must not connect to a local database instance.');
    process.exit(1);
  }

  // Guard against weak admin tokens in production
  if (raw.ADMIN_API_TOKEN.length < 64) {
    console.error('❌ Production startup rejected: ADMIN_API_TOKEN must be at least 64 characters in production.');
    process.exit(1);
  }

  // Guard against weak HMAC secrets in production
  if (raw.LICENSE_KEY_HMAC_SECRET.length < 64) {
    console.error('❌ Production startup rejected: LICENSE_KEY_HMAC_SECRET must be at least 64 characters in production.');
    process.exit(1);
  }
}

export const config = {
  ...raw,
  PORT: parseInt(raw.PORT, 10),
  // Provide typed access — undefined in dev/test, string in production (enforced above)
  LICENSING_SERVER_PRIVATE_KEY: raw.LICENSING_SERVER_PRIVATE_KEY ?? '',
  LICENSING_SERVER_KEY_ID: raw.LICENSING_SERVER_KEY_ID ?? '',
};
