import { NextRequest } from "next/server";

/**
 * Derive the public-facing base URL for use in redirects and magic link URLs.
 *
 * Priority:
 *   1. NEXT_PUBLIC_BASE_URL — explicit App Service application setting (recommended)
 *   2. x-forwarded-proto + x-forwarded-host — injected by Azure App Service /
 *      Front Door; contains the public hostname, not the internal container address
 *   3. request.nextUrl — last resort for bare local dev with no proxy
 *
 * Never use `request.url` directly for building redirect targets — it resolves
 * to the internal container hostname (e.g. d1b9b7a58da6:8080) in Azure App Service.
 */
export function getPublicBaseUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // Bare local dev fallback — no proxy in the path
  return `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}
