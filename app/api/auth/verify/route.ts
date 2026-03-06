import { NextRequest, NextResponse } from "next/server";
import { validateMagicLinkToken } from "@/lib/auth/magic-link";
import { createSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/logger";
import { AuditAction } from "@/types";

function getIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = getIp(request);
  const token = request.nextUrl.searchParams.get("token") ?? "";

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }

  const email = await validateMagicLinkToken(token, ip);

  if (!email) {
    await writeAuditLog({
      userEmail: "unknown",
      ipAddress: ip,
      action: AuditAction.MAGIC_LINK_FAILED,
      detail: {},
    });
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }

  await writeAuditLog({
    userEmail: email,
    ipAddress: ip,
    action: AuditAction.MAGIC_LINK_VERIFIED,
    detail: { email },
  });

  // Create session and redirect to gallery home
  const response = NextResponse.redirect(new URL("/", request.url));
  await createSession(email, ip, response);

  await writeAuditLog({
    userEmail: email,
    ipAddress: ip,
    action: AuditAction.SESSION_CREATED,
    detail: { email },
  });

  return response;
}
