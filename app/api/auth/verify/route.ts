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

/**
 * Build the confirmation landing page HTML.
 *
 * Email security scanners (Microsoft Safe Links, Google Safe Browsing, etc.)
 * follow GET links automatically and would consume the single-use token before
 * the real user clicks. By showing a landing page with a form that POSTs,
 * scanners load the page but never submit the form — only a real user does.
 */
function buildConfirmationPage(
  token: string,
  tenantSlug: string,
  nextPath: string,
  mode: string,
  publicBase: string,
  nonce: string,
): string {
  const actionUrl = `${publicBase}/api/auth/verify`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In — Media Gallery</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f1f5f9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      max-width: 440px;
      width: 100%;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    .header {
      background: #1e3a5f;
      padding: 20px 28px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .icon {
      width: 40px; height: 40px;
      background: rgba(255,255,255,0.15);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; color: #fff;
    }
    .header-text { color: #fff; font-size: 17px; font-weight: 700; }
    .header-sub { color: #bfdbfe; font-size: 11px; margin-top: 3px; }
    .body { padding: 32px 28px; }
    h1 { font-size: 22px; font-weight: 700; color: #1e293b; margin-bottom: 12px; }
    p { font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 24px; }
    .btn {
      display: block; width: 100%;
      padding: 14px 24px;
      background: #1e3a5f; color: #fff;
      font-size: 15px; font-weight: 700;
      border: none; border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn:hover { background: #16304e; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .footer {
      padding: 16px 28px;
      border-top: 1px solid #e2e8f0;
      background: #f8fafc;
    }
    .footer p { font-size: 11px; color: #94a3b8; margin-bottom: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">&#128274;</div>
      <div>
        <div class="header-text">Aleut Federal Media Gallery</div>
        <div class="header-sub">Controlled Unclassified Information</div>
      </div>
    </div>
    <div class="body">
      <h1>Confirm Sign In</h1>
      <p>Click the button below to complete your login. This link expires in 10 minutes and can only be used once.</p>
      <form method="POST" action="${actionUrl}" id="verify-form">
        <input type="hidden" name="token" value="${token}">
        <input type="hidden" name="tenant" value="${tenantSlug}">
        <input type="hidden" name="next" value="${nextPath}">
        <input type="hidden" name="mode" value="${mode}">
        <button type="submit" class="btn" id="verify-btn">Sign In to Media Gallery</button>
      </form>
    </div>
    <div class="footer">
      <p>This system may contain Controlled Unclassified Information (CUI). Handle in accordance with applicable laws, regulations, and organizational policies. Unauthorized disclosure is prohibited.</p>
    </div>
  </div>
  <script nonce="${nonce}">
    document.getElementById('verify-form').addEventListener('submit', function() {
      document.getElementById('verify-btn').disabled = true;
      document.getElementById('verify-btn').textContent = 'Signing in...';
    });
  </script>
</body>
</html>`;
}

/**
 * GET /api/auth/verify?token=<raw_token>
 *
 * Shows a confirmation landing page. The actual token verification happens
 * via POST when the user clicks the "Sign In" button. This prevents email
 * security scanners from consuming the single-use token.
 */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const tenantSlug = request.nextUrl.searchParams.get("tenant") ?? "";
  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next")) ?? "";
  const mode = request.nextUrl.searchParams.get("mode") ?? "";

  const publicBase = getPublicBaseUrl(request);
  const nonce = request.headers.get("x-nonce") ?? "";

  if (!token) {
    logWarn("auth.verify.GET.missing_token", { ip: getIp(request) });
    const loginPath = tenantSlug
      ? `${buildTenantLoginPath(tenantSlug)}?error=invalid`
      : "/login?error=invalid";
    return NextResponse.redirect(new URL(loginPath, publicBase));
  }

  // Return the confirmation landing page
  return new NextResponse(
    buildConfirmationPage(token, tenantSlug, nextPath, mode, publicBase, nonce),
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

/**
 * POST /api/auth/verify
 *
 * Actually validates the magic link token and creates a session.
 * Called by the confirmation page form submission.
 */
async function handlePost(request: NextRequest): Promise<NextResponse> {
  const ip = getIp(request);

  // Read form data (submitted by the confirmation page)
  let token = "";
  let tenantSlug = "";
  let nextPath = "";
  let isPlatformAdminMode = false;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    token = (formData.get("token") as string) ?? "";
    tenantSlug = (formData.get("tenant") as string) ?? "";
    nextPath = sanitizeNextPath((formData.get("next") as string) ?? "") ?? "";
    isPlatformAdminMode = (formData.get("mode") as string) === "platform-admin";
  } else {
    // JSON body fallback
    try {
      const body = await request.json();
      token = body.token ?? "";
      tenantSlug = body.tenant ?? "";
      nextPath = sanitizeNextPath(body.next ?? "") ?? "";
      isPlatformAdminMode = body.mode === "platform-admin";
    } catch {
      // Ignore parse errors
    }
  }

  const publicBase = getPublicBaseUrl(request);
  const invalidLoginPath = tenantSlug
    ? (() => {
        const url = new URL(buildTenantLoginPath(tenantSlug), "http://localhost");
        url.searchParams.set("error", "invalid");
        if (nextPath) url.searchParams.set("next", nextPath);
        return `${url.pathname}${url.search}`;
      })()
    : (() => {
        const url = new URL("/login", "http://localhost");
        url.searchParams.set("error", "invalid");
        if (nextPath) url.searchParams.set("next", nextPath);
        return `${url.pathname}${url.search}`;
      })();

  if (!token) {
    logWarn("auth.verify.POST.missing_token", { ip });
    return NextResponse.redirect(new URL(invalidLoginPath, publicBase));
  }

  const email = await validateMagicLinkToken(token, ip);

  if (!email) {
    logWarn("auth.verify.POST.invalid_token", { ip, reason: "token_validation_failed" });
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

  try {
    // Resolve preferred tenant from slug
    let preferredTenantId: string | undefined;
    let preferredTenantSlug: string | undefined;
    if (tenantSlug) {
      const tenant = await getTenantBySlug(tenantSlug);
      if (tenant) {
        preferredTenantId = tenant.id;
        preferredTenantSlug = tenant.slug;
      }
    }

    const { tenantIds, activeTenantId, signedCookieValue } =
      await createSession(email, ip, preferredTenantId);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.SESSION_CREATED,
      detail: { email, method: "magic-link" },
    });

    const isPlatformAdmin = await canAccessAdmin(email);

    // Redirect priority
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
    logError("auth.verify.POST.session_creation_failed", {
      email,
      error: err,
      hint: "Token was valid but session creation failed",
    });

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
export const POST = withRouteLogging("auth.verify.POST", handlePost);
