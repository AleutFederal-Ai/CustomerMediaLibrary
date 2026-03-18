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

  // Create session
  const redirectTarget = resolvePostLoginRedirect("/", request.url);
  const response = NextResponse.redirect(redirectTarget);
  const { tenantIds, activeTenantId } = await createSession(email, ip, response, preferredTenantId);

  await writeAuditLog({
    userEmail: email,
    ipAddress: ip,
    action: AuditAction.SESSION_CREATED,
    detail: { email, method: "magic-link" },
  });

  // If the user has no tenant access at all, redirect to login with an error
  if (tenantIds.length === 0) {
    const noAccessUrl = new URL("/login?error=no-access", request.url);
    const noAccessResponse = NextResponse.redirect(noAccessUrl);
    // Clear the cookie that was just set
    noAccessResponse.cookies.set("mg_session", "", { maxAge: 0, path: "/" });
    return noAccessResponse;
  }

  // If multiple tenants and no preferred active one was pre-selected, send to picker
  if (!activeTenantId && tenantIds.length > 1) {
    return NextResponse.redirect(new URL("/select-tenant", request.url));
  }

  return response;
}

function resolvePostLoginRedirect(defaultPath: string, requestUrl: string): URL {
  return new URL(defaultPath, requestUrl);
}
