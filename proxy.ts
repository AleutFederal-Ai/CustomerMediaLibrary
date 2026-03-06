// Next.js 16: proxy.ts always runs on Node.js runtime — no runtime export needed
import { NextRequest, NextResponse } from "next/server";
import { validateSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/request-link",
  "/api/auth/verify",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Allow static files, Next.js internals
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
    return NextResponse.next();
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
  const response = NextResponse.next();
  response.headers.set("x-session-id", session.sessionId);
  response.headers.set("x-session-email", session.email);
  response.headers.set("x-client-ip", ip);

  return response;
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
