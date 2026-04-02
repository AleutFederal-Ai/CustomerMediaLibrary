import { NextRequest, NextResponse } from "next/server";
import { validateMagicLinkToken } from "@/lib/auth/magic-link";
import { canAccessAdmin } from "@/lib/auth/admin";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { getTenantById, getTenantBySlug } from "@/lib/auth/tenant";
import { writeAuditLog } from "@/lib/audit/logger";
import { getPublicBaseUrl } from "@/lib/auth/base-url";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { buildTenantLoginPath } from "@/lib/admin-scope";
import { withRouteLogging, logWarn, logError } from "@/lib/logging/structured";
import { AuditAction } from "@/types";

function getIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const ip = getIp(request);
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const tenantSlug = request.nextUrl.searchParams.get("tenant") ?? "";
  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const isPlatformAdminMode = request.nextUrl.searchParams.get("mode") === "platform-admin";

  const publicBase = getPublicBaseUrl(request);
  const invalidLoginPath = tenantSlug
    ? (() => {
        const url = new URL(buildTenantLoginPath(tenantSlug), "http://localhost");
        url.searchParams.set("error", "invalid");
        if (nextPath) {
          url.searchParams.set("next", nextPath);
        }
        return `${url.pathname}${url.search}`;
      })()
    : (() => {
        const url = new URL("/login", "http://localhost");
        url.searchParams.set("error", "invalid");
        if (nextPath) {
          url.searchParams.set("next", nextPath);
        }
        return `${url.pathname}${url.search}`;
      })();

  if (!token) {
    logWarn("auth.verify.GET.missing_token", { ip });
    return NextResponse.redirect(new URL(invalidLoginPath, publicBase));
  }

  const email = await validateMagicLinkToken(token, ip);

  if (!email) {
    logWarn("auth.verify.GET.invalid_token", { ip, reason: "token_validation_failed" });
    await writeAuditLog({
      userEmail: "unknown",
      ipAddress: ip,
      action: AuditAction.MAGIC_LINK_FAILED,
      detail: {},
    });
    return NextResponse.redirect(new URL(invalidLoginPath, publicBase));
  }

  await writeAuditLog({
    userEmail: email,
    ipAddress: ip,
    action: AuditAction.MAGIC_LINK_VERIFIED,
    detail: { email },
  });

  // Wrap session creation in try/catch so that infrastructure failures
  // (Cosmos, Key Vault) after a valid token don't produce a raw 500.
  try {
    // Resolve preferred tenant from slug (if provided in the magic link URL)
    let preferredTenantId: string | undefined;
    let preferredTenantSlug: string | undefined;
    if (tenantSlug) {
      const tenant = await getTenantBySlug(tenantSlug);
      if (tenant) {
        preferredTenantId = tenant.id;
        preferredTenantSlug = tenant.slug;
      }
    }

    // Create session — returns tenant membership info needed for redirect logic
    const { tenantIds, activeTenantId, signedCookieValue } =
      await createSession(email, ip, preferredTenantId);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.SESSION_CREATED,
      detail: { email, method: "magic-link" },
    });

    const isPlatformAdmin = await canAccessAdmin(email);

    // Redirect priority:
    // 0. Safe return path from the original shared link
    // 1. Explicit platform-admin sign-in entry
    // 2. Explicitly selected tenant from login
    // 3. Active tenant resolved on the session
    // 4. Multi-tenant selection step
    // 5. Platform admin console
    let redirectPath: string;
    if (nextPath) {
      redirectPath = nextPath;
    } else if (isPlatformAdminMode) {
      redirectPath = "/admin";
    } else if (preferredTenantSlug) {
      redirectPath = `/t/${preferredTenantSlug}`;
    } else if (activeTenantId) {
      const activeTenant = await getTenantById(activeTenantId);
      redirectPath = activeTenant?.slug ? `/t/${activeTenant.slug}` : "/";
    } else if (tenantIds.length > 1) {
      redirectPath = "/select-tenant";
    } else if (isPlatformAdminMode || isPlatformAdmin) {
      redirectPath = "/admin";
    } else {
      redirectPath = "/select-tenant";
    }

    const response = NextResponse.redirect(new URL(redirectPath, publicBase));
    setSessionCookie(response, signedCookieValue);
    return response;
  } catch (err) {
    logError("auth.verify.GET.session_creation_failed", {
      email,
      error: err,
      hint: "Token was valid but session creation failed",
    });

    // Build an error redirect — use "server" to distinguish from invalid token
    const errorPath = tenantSlug
      ? (() => {
          const url = new URL(buildTenantLoginPath(tenantSlug), "http://localhost");
          url.searchParams.set("error", "server");
          if (nextPath) url.searchParams.set("next", nextPath);
          return `${url.pathname}${url.search}`;
        })()
      : (() => {
          const url = new URL("/login", "http://localhost");
          url.searchParams.set("error", "server");
          if (nextPath) url.searchParams.set("next", nextPath);
          return `${url.pathname}${url.search}`;
        })();
    return NextResponse.redirect(new URL(errorPath, publicBase));
  }
}

export const GET = withRouteLogging("auth.verify.GET", handleGet);
