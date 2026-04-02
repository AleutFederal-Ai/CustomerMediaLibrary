import { NextRequest, NextResponse } from "next/server";
import { revokeSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/logger";
import { getPublicBaseUrl } from "@/lib/auth/base-url";
import { withRouteLogging, logInfo } from "@/lib/logging/structured";
import { AuditAction } from "@/types";

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.headers.get("x-session-id");
  const email = request.headers.get("x-session-email") ?? "unknown";
  const ip = request.headers.get("x-client-ip") ?? "unknown";

  const response = NextResponse.redirect(new URL("/login", getPublicBaseUrl(request)));

  if (sessionId) {
    await revokeSession(sessionId, response);
    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.SESSION_REVOKED,
      detail: { sessionId },
    });
    logInfo("auth.signout.GET.session_revoked", { email, sessionId });
  } else {
    // Clear cookie even without a valid session
    response.cookies.set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    logInfo("auth.signout.GET.no_session", { email });
  }

  return response;
}

export const GET = withRouteLogging("auth.signout.GET", handleGet);
