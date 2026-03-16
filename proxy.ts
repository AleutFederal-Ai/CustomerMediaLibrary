// Next.js 16: proxy.ts always runs on Node.js runtime — no runtime export needed
import { NextRequest, NextResponse } from "next/server";
import { validateSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import crypto from "crypto";

// In Docker dev mode, Next.js App Router does not automatically apply the
// x-nonce to its own hydration scripts, so we relax to unsafe-inline.
// Production keeps the strict nonce-based policy.
const IS_DOCKER_DEV = process.env.DOCKER_DEV === "true";

function buildCsp(nonce: string): string {
  const scriptSrc = IS_DOCKER_DEV
    ? "script-src 'self' 'unsafe-inline'"
    : `script-src 'self' 'nonce-${nonce}'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.blob.core.usgovcloudapi.net",
    "media-src 'self' blob: https://*.blob.core.usgovcloudapi.net",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function withSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

// ----------------------------------------------------------------
// Dev bypass — DOCKER_DEV=true only
// Set cookie  dev_bypass=1  (or header x-dev-bypass: 1) to skip
// auth and inject a fake session for UI testing.
// ----------------------------------------------------------------
const DEV_BYPASS_EMAIL = "dev@aleutfederal.com";
const DEV_BYPASS_TENANT = "tenant-aleutfederal";

function injectDevSession(response: NextResponse): NextResponse {
  response.headers.set("x-session-id", "dev-bypass-session");
  response.headers.set("x-session-email", DEV_BYPASS_EMAIL);
  response.headers.set("x-client-ip", "127.0.0.1");
  response.headers.set("x-active-tenant-id", DEV_BYPASS_TENANT);
  response.headers.set("x-tenant-ids", DEV_BYPASS_TENANT);
  return response;
}

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/request-link",
  "/api/auth/verify",
  "/api/auth/password",
  "/api/auth/signout",
  "/api/health",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Generate a per-request nonce for CSP. Forward it as x-nonce so Next.js
  // injects it into its own inline hydration scripts automatically.
  const nonce = crypto.randomBytes(16).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  function nextWithNonce() {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Dev bypass — only active when DOCKER_DEV=true
  if (process.env.DOCKER_DEV === "true") {
    const hasBypassCookie = request.cookies.get("dev_bypass")?.value === "1";
    const hasBypassHeader = request.headers.get("x-dev-bypass") === "1";
    if (hasBypassCookie || hasBypassHeader) {
      return withSecurityHeaders(injectDevSession(nextWithNonce()), nonce);
    }
  }

  // Allow static files, Next.js internals (no CSP needed for these)
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return NextResponse.next();
  }

  // Allow public paths without authentication
  if (isPublicPath(pathname)) {
    return withSecurityHeaders(nextWithNonce(), nonce);
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const session = await validateSession(request);

  if (!session) {
    // Clear potentially stale cookie
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return response;
  }

  // Attach session context to request headers for downstream route handlers
  const response = nextWithNonce();
  response.headers.set("x-session-id", session.sessionId);
  response.headers.set("x-session-email", session.email);
  response.headers.set("x-client-ip", ip);
  response.headers.set("x-active-tenant-id", session.activeTenantId ?? "");
  response.headers.set("x-tenant-ids", session.tenantIds.join(","));

  return withSecurityHeaders(response, nonce);
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
