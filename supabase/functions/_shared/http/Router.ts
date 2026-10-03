import { adminAuth, AdminRole, AdminAuthResult } from '../middleware/adminAuth.ts';

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
          
          return await route.handler(req, url, params);
        }
      }
    }
    console.log(`No route matched for ${method} ${url.pathname}`);
    return null; // Not found
  }
}
