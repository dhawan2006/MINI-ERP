import { adminAuth, AdminRole, AdminAuthResult } from '../middleware/adminAuth.ts';
import { getDb } from '../database/db.ts';
import { encodeHex } from 'https://deno.land/std@0.207.0/encoding/hex.ts';

export type RequestHandler = (req: Request, url: URL, params: Record<string, string>) => Promise<Response>;

export interface RouteOptions {
  roles?: AdminRole[];
  requireMfa?: boolean;
}

export class Router {
  private routes: { method: string; pattern: URLPattern; handler: RequestHandler; options?: RouteOptions }[] = [];
  
  constructor(private basePath: string = '') {}

  add(method: string, patternStr: string, options: RouteOptions | RequestHandler, handler?: RequestHandler) {
    let actualOptions: RouteOptions | undefined;
    let actualHandler: RequestHandler;

    if (typeof options === 'function') {
      actualHandler = options;
    } else {
      actualOptions = options;
      actualHandler = handler!;
    }

    this.routes.push({
      method: method.toUpperCase(),
      pattern: new URLPattern({ pathname: `${this.basePath}${patternStr}` }),
      handler: actualHandler,
      options: actualOptions
    });
  }

  async handle(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    console.log(`Router handle: req.url=${req.url}, pathname=${url.pathname}, method=${method}`);

    for (const route of this.routes) {
      if (route.method === method || route.method === 'ALL') {
        const match = route.pattern.exec(url);
        if (match) {
          const params = match.pathname.groups;
          
          // Perform Auth Check if options exist or just basic auth
          const roles = route.options?.roles;
          const requireMfa = route.options?.requireMfa || false;
          
          const authResult = await adminAuth(req, roles, requireMfa);
          if (!authResult.authorized) {
            return authResult.response!;
          }
          
          // Attach auth result to req for handler to use
          (req as any).adminAuth = authResult;

          // Idempotency check for sensitive mutations (POST/PUT/DELETE)
          const idempotencyKey = req.headers.get('X-Idempotency-Key');
          let clonedReq = req;
          
          if (idempotencyKey && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
            const bodyBuffer = await req.arrayBuffer();
            const bodyText = new TextDecoder().decode(bodyBuffer);
            
            const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bodyText));
            const payloadHash = encodeHex(hashBuffer);

            const sql = getDb();
            // Check if key exists
            const existing = await sql`
              SELECT * FROM admin_idempotency_keys WHERE request_id = ${idempotencyKey}
            `;
            
            if (existing.length > 0) {
              const prev = existing[0];
              if (prev.payload_hash !== payloadHash) {
                return new Response(JSON.stringify({ error: 'CONFLICT', message: 'Idempotency key reused with different payload' }), {
                  status: 409,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
              if (prev.status === 'COMPLETED') {
                return new Response(JSON.stringify(prev.response_body), {
                  status: prev.response_status,
                  headers: { 'Content-Type': 'application/json' }
                });
              } else if (prev.status === 'PENDING') {
                return new Response(JSON.stringify({ error: 'CONFLICT', message: 'Request already in progress' }), {
                  status: 409,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            } else {
              // Insert PENDING
              await sql`
                INSERT INTO admin_idempotency_keys (request_id, admin_id, path, payload_hash, status)
                VALUES (${idempotencyKey}, ${authResult.adminId}, ${url.pathname}, ${payloadHash}, 'PENDING')
              `;
            }

            // Restore the request body for the handler
            clonedReq = new Request(req.url, {
              method: req.method,
              headers: req.headers,
              body: bodyBuffer
            });
            (clonedReq as any).adminAuth = authResult;
          }
          
          // Call actual handler
          const response = await route.handler(clonedReq, url, params);

          // Update idempotency key if present
          if (idempotencyKey && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
            const sql = getDb();
            // We need to read the response body to store it. But body can only be read once.
            // Let's clone the response so we can read it.
            const clonedResponse = response.clone();
            const resText = await clonedResponse.text();
            let resJson = null;
            try {
              resJson = JSON.parse(resText);
            } catch (e) {}

            await sql`
              UPDATE admin_idempotency_keys
              SET status = 'COMPLETED', response_status = ${response.status}, response_body = ${resJson ? JSON.stringify(resJson) : null}
              WHERE request_id = ${idempotencyKey}
            `;
          }

          return response;
        }
      }
    }
    console.log(`No route matched for ${method} ${url.pathname}`);
    return null; // Not found
  }
}
