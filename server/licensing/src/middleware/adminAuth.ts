// ---------------------------------------------------------------------------
// Phase 12 — Admin Authentication Middleware (Hardened)
//
// Security properties:
//  - Reads token from config (ADMIN_API_TOKEN), not raw process.env, so
//    it benefits from config validation at startup.
//  - Uses crypto.timingSafeEqual() for constant-time comparison.
//  - Never logs the token value or the supplied credential.
//  - Pre-computes the expected token Buffer once at import time so that
//    timing cannot reveal token length through repeated dynamic Buffer creation.
//  - Rejects missing/malformed Authorization header with 401 before any
//    comparison (avoids timing oracle on token length).
//  - The correlation ID from the request is included in the auth-failure audit
//    log so repeated failed attempts can be traced.
// ---------------------------------------------------------------------------

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config/config';

export interface AdminRequest extends Request {
  adminId?: string;
  correlationId?: string;
}

// Pre-encoded expected token — computed once, not per-request.
// crypto.timingSafeEqual() requires buffers of identical length; we keep this
// buffer and compare its length first before attempting the safe comparison.
const EXPECTED_TOKEN_BYTES = Buffer.from(config.ADMIN_API_TOKEN, 'utf8');
const EXPECTED_TOKEN_LENGTH = EXPECTED_TOKEN_BYTES.length;

/**
 * Middleware: validates the Bearer token in the Authorization header.
 *
 * On success: sets req.adminId = 'system-admin' and calls next().
 * On failure: logs a structured event (without secret material) and returns 401.
 *
 * IMPORTANT: this middleware does NOT call next(err) on auth failure because
 * Express's global error handler might alter the response format and reveal
 * details. We always respond inline with a fixed 401.
 */
export function adminAuth(req: AdminRequest, res: Response, next: NextFunction): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.correlationId = correlationId;

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Do NOT reveal the expected format in the message body — standard 401 is sufficient.
    console.warn('[admin-auth] Missing or malformed Authorization header', {
      correlationId,
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({ error: 'LIFECYCLE_ADMIN_UNAUTHORIZED', message: 'Admin authentication required' });
    return;
  }

  const suppliedToken = authHeader.substring(7); // strip 'Bearer '
  const suppliedBytes = Buffer.from(suppliedToken, 'utf8');

  // Length must match before we can call timingSafeEqual (it throws if lengths differ).
  // We still perform a time-constant length comparison to avoid a trivial timing oracle.
  // Note: Buffer.from + length check itself is not fully constant-time if the branch
  // is taken on mismatched length, but this is the standard Node.js recommended pattern.
  if (suppliedBytes.length !== EXPECTED_TOKEN_LENGTH) {
    console.warn('[admin-auth] Admin authentication failed (length mismatch)', {
      correlationId,
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({ error: 'LIFECYCLE_ADMIN_UNAUTHORIZED', message: 'Invalid admin credentials' });
    return;
  }

  const isMatch = crypto.timingSafeEqual(suppliedBytes, EXPECTED_TOKEN_BYTES);

  if (!isMatch) {
    console.warn('[admin-auth] Admin authentication failed (token mismatch)', {
      correlationId,
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({ error: 'LIFECYCLE_ADMIN_UNAUTHORIZED', message: 'Invalid admin credentials' });
    return;
  }

  // In a real multi-admin system, the token would map to a specific admin identity.
  // For this single-admin setup, 'system-admin' is the fixed auditable actor.
  req.adminId = 'system-admin';
  next();
}
