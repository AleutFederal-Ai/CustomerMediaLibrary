import { NextRequest, NextResponse } from "next/server";
import { revokeSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/logger";
import { getPublicBaseUrl, isSameOriginRequest } from "@/lib/auth/base-url";
import { getTenantById } from "@/lib/auth/tenant";
import { withRouteLogging, logInfo, logWarn } from "@/lib/logging/structured";
import { AuditAction } from "@/types";

async function handleGet(request: NextRequest): Promise<NextResponse> {
  // CSRF protection: signout is a state-changing GET endpoint.
  // With SameSite=Lax, the cookie is sent on cross-site top-level GETs,
  // so we verify the request originates from the same site.
  if (!isSameOriginRequest(request)) {
    logWarn("auth.signout.GET.csrf_blocked", {
      ip: request.headers.get("x-client-ip") ?? "unknown",
      secFetchSite: request.headers.get("sec-fetch-site"),
      referer: request.headers.get("referer"),
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionId = request.headers.get("x-session-id");
  const email = request.headers.get("x-session-email") ?? "unknown";
  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const activeTenantId = request.headers.get("x-active-tenant-id") ?? "";

  // Resolve tenant-aware redirect: if the user was in a tenant context,
  // redirect to that tenant's login page so they can sign back in easily.
  let redirectPath = "/login";
  if (activeTenantId) {
    try {
      const tenant = await getTenantById(activeTenantId);
      if (tenant?.slug) {
        redirectPath = `/t/${tenant.slug}/login`;
      }
    } catch {
      // Fall back to generic login on lookup failure
    }
  }

  const response = NextResponse.redirect(new URL(redirectPath, getPublicBaseUrl(request)));

  if (sessionId) {
    await revokeSession(sessionId, response);
    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.SESSION_REVOKED,
      detail: { sessionId },
    });
    logInfo("auth.signout.GET.session_revoked", { email, sessionId, redirectPath });
  } else {
    // Clear cookie even without a valid session
    response.cookies.set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    logInfo("auth.signout.GET.no_session", { email });
  }

  return response;
}

export const GET = withRouteLogging("auth.signout.GET", handleGet);
