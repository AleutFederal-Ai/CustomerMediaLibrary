import { NextRequest, NextResponse } from "next/server";
import { validateMagicLinkToken } from "@/lib/auth/magic-link";
import { createSession } from "@/lib/auth/session";
import { getTenantBySlug } from "@/lib/auth/tenant";
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
  const tenantSlug = request.nextUrl.searchParams.get("tenant") ?? "";
  const isPlatformAdminMode = request.nextUrl.searchParams.get("mode") === "platform-admin";

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

  // Resolve preferred tenant from slug (if provided in the magic link URL)
  let preferredTenantId: string | undefined;
  if (tenantSlug) {
    const tenant = await getTenantBySlug(tenantSlug);
    if (tenant) preferredTenantId = tenant.id;
  }

  // Create session — returns tenant membership info needed for redirect logic
  const tempResponse = new NextResponse();
  const { tenantIds, activeTenantId } = await createSession(email, ip, tempResponse, preferredTenantId);

  await writeAuditLog({
    userEmail: email,
    ipAddress: ip,
    action: AuditAction.SESSION_CREATED,
    detail: { email, method: "magic-link" },
  });

  // Determine redirect destination now that we know tenant membership
  let redirectPath: string;
  if (isPlatformAdminMode || tenantIds.length === 0) {
    // Platform admin intent, or no tenant memberships — go to admin console
    redirectPath = "/admin";
  } else if (!activeTenantId && tenantIds.length > 1) {
    redirectPath = "/select-tenant";
  } else {
    redirectPath = "/";
  }

  // Build final redirect response and copy the session cookie set by createSession
  const response = NextResponse.redirect(new URL(redirectPath, request.url));
  tempResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });

  return response;
}
