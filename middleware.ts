import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "mg_session";

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/request-link",
  "/api/auth/verify",
  "/api/auth/signout",
];

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.blob.core.usgovcloudapi.net",
    "media-src 'self' blob: https://*.blob.core.usgovcloudapi.net",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

function applySecurityHeaders(response: NextResponse): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
}

/**
 * Verify the signed cookie using Web Crypto (Edge Runtime compatible).
 * Cookie format: base64url(sessionId:email).<hmac-sha256-hex>
 * SESSION_SIGNING_SECRET must be set as an App Service application setting
 * (use a Key Vault reference: @Microsoft.KeyVault(VaultName=mymedia-kv;SecretName=SessionSigningSecret))
 */
async function verifySessionCookie(
  cookieValue: string
): Promise<{ sessionId: string; email: string } | null> {
  const secret = process.env.SESSION_SIGNING_SECRET;
  if (!secret) return null;

  const lastDot = cookieValue.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = cookieValue.slice(0, lastDot);
  const providedSig = cookieValue.slice(lastDot + 1);

  // Compute expected HMAC using Web Crypto
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expectedSig = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (providedSig.length !== expectedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < providedSig.length; i++) {
    diff |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  if (diff !== 0) return null;

  // Decode base64url payload to extract sessionId:email
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const decoded = atob(padded);
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) return null;
    return {
      sessionId: decoded.slice(0, colonIdx),
      email: decoded.slice(colonIdx + 1),
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always apply security headers
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isPublic) {
    const response = NextResponse.next();
    applySecurityHeaders(response);
    return response;
  }

  // Validate session cookie
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue) {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    // Clear any stale cookie
    response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    applySecurityHeaders(response);
    return response;
  }

  const session = await verifySessionCookie(cookieValue);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    applySecurityHeaders(response);
    return response;
  }

  // Forward session context to page/API route handlers via request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-session-email", session.email);
  requestHeaders.set("x-session-id", session.sessionId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
