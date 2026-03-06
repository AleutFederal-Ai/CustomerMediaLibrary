import { NextRequest, NextResponse } from "next/server";
import { revokeSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/logger";
import { AuditAction } from "@/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.headers.get("x-session-id");
  const email = request.headers.get("x-session-email") ?? "unknown";
  const ip = request.headers.get("x-client-ip") ?? "unknown";

  const response = NextResponse.redirect(new URL("/login", request.url));

  if (sessionId) {
    await revokeSession(sessionId, response);
    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.SESSION_REVOKED,
      detail: { sessionId },
    });
  } else {
    // Clear cookie even without a valid session
    response.cookies.set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  }

  return response;
}
