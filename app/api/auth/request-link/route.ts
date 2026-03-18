import { NextRequest, NextResponse } from "next/server";
import { isDomainAllowed } from "@/lib/auth/domain-check";
import { checkRateLimit, generateMagicLinkToken } from "@/lib/auth/magic-link";
import { sendMagicLinkEmail } from "@/lib/azure/graph";
import { writeAuditLog } from "@/lib/audit/logger";
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

  try {
    const body = await request.json();
    email = (body?.email ?? "").toString().trim().toLowerCase();
    tenantSlug = (body?.tenantSlug ?? "").toString().trim().toLowerCase();
    mode = (body?.mode ?? "").toString().trim();
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

  // Check domain allowlist — silently do nothing if not allowed
  const { allowed } = await isDomainAllowed(email);
  if (!allowed) {
    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  }

  try {
    const rawToken = await generateMagicLinkToken(email, ip);
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      (request.headers.get("origin") || "http://localhost:3000");
    const tenantParam = tenantSlug ? `&tenant=${encodeURIComponent(tenantSlug)}` : "";
    const modeParam = mode === "platform-admin" ? "&mode=platform-admin" : "";
    const magicLinkUrl = `${baseUrl}/api/auth/verify?token=${rawToken}${tenantParam}${modeParam}`;

    await sendMagicLinkEmail(email, magicLinkUrl);
  } catch (err) {
    // Log but do not expose error details to the caller
    console.error("[request-link] Failed to send magic link:", err);
  }

  return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
}
