import { NextRequest } from "next/server";

/**
 * Derive the public-facing base URL for use in redirects and magic link URLs.
 *
 * Priority:
 *   1. APP_BASE_URL — plain server-side env var, always read at runtime.
 *      Set this in Azure App Service → Environment variables.
 *      (NEXT_PUBLIC_BASE_URL is NOT used here — Next.js bakes NEXT_PUBLIC_*
 *      variables into the server bundle at build time, so a runtime App Service
 *      setting has no effect on server-side code.)
 *   2. x-forwarded-proto + x-forwarded-host — injected by Azure App Service /
 *      Front Door; contains the public hostname, not the internal container address
 *   3. request.nextUrl — last resort for bare local dev with no proxy
 *
 * Never use `request.url` directly for building redirect targets — it resolves
 * to the internal container hostname (e.g. d1b9b7a58da6:8080) in Azure App Service.
 */
export function getPublicBaseUrl(request: NextRequest): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, "");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // Bare local dev fallback — no proxy in the path
  return `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}
