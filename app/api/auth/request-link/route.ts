import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, generateMagicLinkToken } from "@/lib/auth/magic-link";
import { sendMagicLinkEmail } from "@/lib/azure/graph";
import { writeAuditLog } from "@/lib/audit/logger";
import { canAccessAdmin } from "@/lib/auth/admin";
import { getPublicBaseUrl } from "@/lib/auth/base-url";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { getUserTenantIds } from "@/lib/auth/tenant";
import { AuditAction } from "@/types";

// Strict email regex — rejects malformed addresses
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

// Always return this message regardless of outcome to prevent enumeration
const GENERIC_RESPONSE = {
  message:
    "If your email is authorized, you will receive a login link shortly.",
};

function getIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getIp(request);

  let email = "";
  let tenantSlug = "";
  let mode = "";
  let nextPath = "";

  try {
    const body = await request.json();
    email = (body?.email ?? "").toString().trim().toLowerCase();
    tenantSlug = (body?.tenantSlug ?? "").toString().trim().toLowerCase();
    mode = (body?.mode ?? "").toString().trim();
    nextPath = sanitizeNextPath((body?.nextPath ?? "").toString()) ?? "";
  } catch {
    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  }

  // Validate email format
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  }

  // Check rate limit (email + IP)
  const withinLimit = await checkRateLimit(email, ip);

  if (!withinLimit) {
    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.MAGIC_LINK_RATE_LIMITED,
      detail: { email },
    });
    // Still return generic message — do not reveal rate limiting to caller
    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  }

  await writeAuditLog({
    userEmail: email,
    ipAddress: ip,
    action: AuditAction.MAGIC_LINK_REQUESTED,
    detail: { email },
  });

  // Allow magic links for users with tenant access or platform-admin access.
  const shouldCheckPlatformAdmin =
    mode === "platform-admin" || Boolean(tenantSlug);

  const [tenantIds, isPlatformAdmin] = await Promise.all([
    getUserTenantIds(email),
    shouldCheckPlatformAdmin
      ? canAccessAdmin(email)
      : Promise.resolve(false),
  ]);
  if (tenantIds.length === 0 && !isPlatformAdmin) {
    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  }

  try {
    const rawToken = await generateMagicLinkToken(email, ip);
    const baseUrl = getPublicBaseUrl(request);
    const tenantParam = tenantSlug ? `&tenant=${encodeURIComponent(tenantSlug)}` : "";
    const modeParam = mode === "platform-admin" ? "&mode=platform-admin" : "";
    const nextParam = nextPath ? `&next=${encodeURIComponent(nextPath)}` : "";
    const magicLinkUrl = `${baseUrl}/api/auth/verify?token=${rawToken}${tenantParam}${modeParam}${nextParam}`;

    await sendMagicLinkEmail(email, magicLinkUrl);
  } catch (err) {
    // Log but do not expose error details to the caller
    console.error("[request-link] Failed to send magic link:", err);
  }

  return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
}
