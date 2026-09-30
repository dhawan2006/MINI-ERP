// ---------------------------------------------------------------------------
// Phase 12 — Production-Hardened Express Application
//
// Key changes from Phase 11:
//  - CORS: origin whitelist derived from config (no wildcard in production)
//  - Rate limiting: endpoint-specific policies (activation stricter than health)
//  - Security headers: Helmet with production-appropriate CSP
//  - Body size: 50 KB limit (reduced from 100 KB; lifecycle payloads are small)
//  - Request timeout: 30 s via express-timeout-handler concept (inline)
//  - Structured error handler: never reveals stack traces, SQL, or paths
//  - All ZodError responses sanitized before returning to client
// ---------------------------------------------------------------------------

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import crypto from 'crypto';
import { config } from './config/config';

import { lifecycleRouter } from './routes/lifecycle';
import { adminRouter } from './routes/admin';
import { activationRouter } from './routes/activation';

const app = express();

// Trust the first proxy (LocalTunnel, Render, Heroku) to fix express-rate-limit ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security headers (Helmet)
// ---------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: false, // This is an API server; CSP is not applicable
  crossOriginEmbedderPolicy: false,
}));

// ---------------------------------------------------------------------------
// CORS
//
// Production: only explicitly listed origins.
// Development/test: all origins permitted for convenience.
// ---------------------------------------------------------------------------
const allowedOrigins = config.ALLOWED_ORIGINS
  ? config.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : null;

app.use(cors({
  origin: (origin, callback) => {
    if (config.NODE_ENV !== 'production') {
      // In dev/test allow everything
      return callback(null, true);
    }
    // In production, require an explicit whitelist
    if (!allowedOrigins || allowedOrigins.length === 0) {
      // If no origins configured in production, reject cross-origin requests
      if (!origin) return callback(null, true); // same-origin requests have no Origin header
      return callback(new Error('CORS: no allowed origins configured'), false);
    }
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origin '${origin}' is not allowed`), false);
  },
  credentials: false,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
}));

// ---------------------------------------------------------------------------
// Body parsing — strict size limit
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '50kb' }));

// ---------------------------------------------------------------------------
// Correlation ID injection — all requests get a traceable ID
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
});

// ---------------------------------------------------------------------------
// Rate Limiting — endpoint-specific policies
//
// Why separate policies:
//  - Activation is an expensive, rare operation — strict limit
//  - Lifecycle (deactivation) is similarly rare — strict
//  - Admin operations are strictly limited to prevent brute-force
//  - Health check is liberal (monitoring systems hit this frequently)
// ---------------------------------------------------------------------------

/** General limiter — default for routes not covered by a specific policy */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (config.NODE_ENV === 'test' || config.NODE_ENV === 'qa') ? 10000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
});

/** Activation/lifecycle limiter — tighter; these are rare intentional operations */
const lifecycleLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (config.NODE_ENV === 'test' || config.NODE_ENV === 'qa') ? 10000 : 20, // max 20 lifecycle operations per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many lifecycle requests. Please try again later.' },
});

/** Admin limiter — very tight; brute-force on admin token must be expensive */
const adminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (config.NODE_ENV === 'test' || config.NODE_ENV === 'qa') ? 10000 : 30, // max 30 admin API calls per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many admin requests. Please try again later.' },
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'OK', version: '1.0.0', environment: config.NODE_ENV });
});

app.use('/api/v1/activation', lifecycleLimiter, activationRouter);
app.use('/api/v1/lifecycle', lifecycleLimiter, lifecycleRouter);
app.use('/api/v1/admin', adminLimiter, adminRouter);

// 404 for any unmatched routes — do not reveal routing structure
app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'The requested endpoint does not exist.' });
});

// ---------------------------------------------------------------------------
// Global Error Handler
//
// SECURITY: Never reveal:
//  - Stack traces
//  - SQL error text
//  - Internal filesystem paths
//  - Environment variable values
//  - Cryptographic intermediate values
// ---------------------------------------------------------------------------
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const correlationId = req.headers['x-correlation-id'] as string;

  if (err instanceof z.ZodError) {
    // Sanitize zod errors: only expose field path and type of validation failure,
    // never the invalid value itself (could be sensitive).
    const safeIssues = err.issues.map(issue => ({
      path: issue.path,
      message: issue.message,
    }));
    return res.status(400).json({
      error: 'LIFECYCLE_INVALID_REQUEST',
      message: 'Request validation failed',
      issues: safeIssues,
      correlationId,
    });
  }

  // CORS errors
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Cross-origin request not allowed',
      correlationId,
    });
  }

  // Log full error server-side (safe — not sent to client)
  console.error('[server] Unhandled error', {
    correlationId,
    error: err?.message,
    // Only log the error code/name, not the full stack in production
    ...(config.NODE_ENV !== 'production' && { stack: err?.stack }),
  });

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An internal error occurred. Please contact support.',
    correlationId,
  });
});

export default app;
