import { NextRequest, NextResponse } from "next/server";
import { users } from "@/lib/azure/cosmos";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { getTenantBySlug } from "@/lib/auth/tenant";
import { writeAuditLog } from "@/lib/audit/logger";
import { AuditAction, UserRecord } from "@/types";

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

// POST /api/auth/password
// Body: { email: string; password: string }
// On success: sets session cookie, returns { ok: true }
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const email =
    typeof b.email === "string" ? b.email.toLowerCase().trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const tenantSlug =
    typeof b.tenantSlug === "string" ? b.tenantSlug.toLowerCase().trim() : "";
  const isPlatformAdminMode = b.mode === "platform-admin";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // Generic error message — never leak whether the account exists
  const INVALID = NextResponse.json(
    { error: "Invalid email or password" },
    { status: 401 }
  );

  try {
    const container = await users();
    const { resources } = await container.items
      .query<UserRecord>({
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: email }],
      })
      .fetchAll();

    const user = resources[0];

    if (!user || !user.passwordHash || user.isBlocked) {
      await writeAuditLog({
        userEmail: email,
        ipAddress: ip,
        action: AuditAction.PASSWORD_LOGIN_FAILED,
        detail: {
          reason: !user
            ? "user_not_found"
            : user.isBlocked
            ? "user_blocked"
            : "no_password_set",
        },
      });
      return INVALID;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await writeAuditLog({
        userEmail: email,
        ipAddress: ip,
        action: AuditAction.PASSWORD_LOGIN_FAILED,
        detail: { reason: "bad_password" },
      });
      return INVALID;
    }

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.PASSWORD_LOGIN_SUCCESS,
      detail: {},
    });

    // Resolve preferred tenant from slug (if provided)
    let preferredTenantId: string | undefined;
    if (tenantSlug) {
      const tenant = await getTenantBySlug(tenantSlug);
      if (tenant) preferredTenantId = tenant.id;
    }

    const { tenantIds, activeTenantId, signedCookieValue } =
      await createSession(email, ip, preferredTenantId);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.SESSION_CREATED,
      detail: { email, method: "password" },
    });

    // Determine where to redirect after login
    let redirectTo: string;
    if (isPlatformAdminMode || tenantIds.length === 0) {
      redirectTo = "/admin";
    } else if (!activeTenantId && tenantIds.length > 1) {
      redirectTo = "/select-tenant";
    } else {
      redirectTo = "/";
    }

    const response = NextResponse.json({ ok: true, redirectTo });
    setSessionCookie(response, signedCookieValue);
    return response;
  } catch (err) {
    console.error("[auth/password] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
