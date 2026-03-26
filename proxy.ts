// Next.js 16: proxy.ts always runs on Node.js runtime — no runtime export needed
import { NextRequest, NextResponse } from "next/server";
import { validateSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getPublicBaseUrl } from "@/lib/auth/base-url";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import crypto from "crypto";
import {
  logError,
  logInfo,
  logWarn,
} from "@/lib/logging/structured";

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

function applySessionHeaders(
  headers: Headers,
  session: {
    sessionId: string;
    email: string;
    activeTenantId: string | null | undefined;
    tenantIds: string[];
    ipAddress: string;
  }
): void {
  headers.set("x-session-id", session.sessionId);
  headers.set("x-session-email", session.email);
  headers.set("x-client-ip", session.ipAddress);
  headers.set("x-active-tenant-id", session.activeTenantId ?? "");
  headers.set("x-tenant-ids", session.tenantIds.join(","));
}

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/select-tenant",
  "/api/auth/request-link",
  "/api/auth/verify",
  "/api/auth/password",
  "/api/auth/signout",
  "/api/health",
  "/api/tenants/public",         // public tenant list (pre-login)
  "/api/tenants/lookup",         // private slug validation (pre-login)
];

function isPublicPath(pathname: string): boolean {
  if (/^\/t\/[^/]+\/login\/?$/.test(pathname)) {
    return true;
  }

  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Generate a per-request nonce for CSP. Forward it as x-nonce so Next.js
  // injects it into its own inline hydration scripts automatically.
  const nonce = crypto.randomBytes(16).toString("base64");
  const requestId = crypto.randomUUID();
  const start = Date.now();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);

  function nextWithNonce() {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  logInfo("proxy.request.received", {
    requestId,
    method: request.method,
    path: pathname,
    queryKeys: Array.from(request.nextUrl.searchParams.keys()),
  });

  // Dev bypass — only active when DOCKER_DEV=true
  if (process.env.DOCKER_DEV === "true") {
    const hasBypassCookie = request.cookies.get("dev_bypass")?.value === "1";
    const hasBypassHeader = request.headers.get("x-dev-bypass") === "1";
    if (hasBypassCookie || hasBypassHeader) {
      applySessionHeaders(requestHeaders, {
        sessionId: "dev-bypass-session",
        email: DEV_BYPASS_EMAIL,
        ipAddress: "127.0.0.1",
        activeTenantId: DEV_BYPASS_TENANT,
        tenantIds: [DEV_BYPASS_TENANT],
      });
      const response = nextWithNonce();
      response.headers.set("x-request-id", requestId);
      logWarn("proxy.request.dev_bypass", {
        requestId,
        path: pathname,
        durationMs: Date.now() - start,
      });
      return withSecurityHeaders(response, nonce);
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
    const response = nextWithNonce();
    response.headers.set("x-request-id", requestId);
    logInfo("proxy.request.public", {
      requestId,
      path: pathname,
      durationMs: Date.now() - start,
    });
    return withSecurityHeaders(response, nonce);
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const session = await validateSession(request);

  if (session === "error") {
    // Infrastructure failure (Cosmos/Key Vault) — NOT an auth problem.
    // Return 503 so the client retries or shows a transient error.
    // Never clear the cookie for infra failures.
    if (pathname.startsWith("/api/")) {
      logError("proxy.session.validation_failed", {
        requestId,
        path: pathname,
        durationMs: Date.now() - start,
      });
      return withSecurityHeaders(
        NextResponse.json(
          { error: "Service temporarily unavailable" },
          { status: 503 }
        ),
        nonce
      );
    }
    // For page navigations, show a simple retry page rather than
    // redirecting to login and destroying the session.
    const response = new NextResponse(
      "<html><body style='font-family:sans-serif;text-align:center;padding:60px'>" +
        "<h2>Temporarily unavailable</h2>" +
        "<p>Please try refreshing the page in a few seconds.</p>" +
        "</body></html>",
      { status: 503, headers: { "Content-Type": "text/html", "Retry-After": "5" } }
    );
    response.headers.set("x-request-id", requestId);
    return response;
  }

  if (!session) {
    // Session is genuinely invalid (no cookie, bad sig, expired, blocked).
    if (pathname.startsWith("/api/")) {
      logWarn("proxy.request.unauthorized", {
        requestId,
        path: pathname,
        durationMs: Date.now() - start,
      });
      return withSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        nonce
      );
    }

    // Page navigations: redirect to login and clear stale cookie
    const loginUrl = new URL(
      pathname === "/" ? "/select-tenant" : "/login",
      getPublicBaseUrl(request)
    );
    const requestedPath = sanitizeNextPath(
      `${pathname}${request.nextUrl.search}${request.nextUrl.hash}`
    );
    const tenantMatch = pathname.match(/^\/t\/([^/]+)(?:\/.*)?$/);
    if (tenantMatch?.[1]) {
      loginUrl.pathname = `/t/${tenantMatch[1]}/login`;
    }
    loginUrl.search = "";
    if (requestedPath && requestedPath !== loginUrl.pathname) {
      loginUrl.searchParams.set("next", requestedPath);
    }
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    response.headers.set("x-request-id", requestId);
    logWarn("proxy.request.redirect_login", {
      requestId,
      path: pathname,
      durationMs: Date.now() - start,
    });
    return response;
  }

  // Attach session context to request headers for downstream route handlers
  applySessionHeaders(requestHeaders, {
    sessionId: session.sessionId,
    email: session.email,
    ipAddress: ip,
    activeTenantId: session.activeTenantId,
    tenantIds: session.tenantIds,
  });

  const response = nextWithNonce();
  response.headers.set("x-request-id", requestId);

  logInfo("proxy.request.authorized", {
    requestId,
    path: pathname,
    durationMs: Date.now() - start,
    sessionId: session.sessionId,
    userEmail: session.email,
    tenantId: session.activeTenantId ?? null,
    tenantCount: session.tenantIds.length,
  });

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
