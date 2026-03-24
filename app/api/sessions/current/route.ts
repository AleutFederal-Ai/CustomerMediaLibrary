import { NextRequest, NextResponse } from "next/server";
import { canAccessAdmin } from "@/lib/auth/admin";
import { switchActiveTenant } from "@/lib/auth/session";
import { getTenantById } from "@/lib/auth/tenant";
import { writeAuditLog } from "@/lib/audit/logger";
import { AuditAction } from "@/types";

async function resolveTenantSwitch(
  request: NextRequest
): Promise<
  | {
      sessionId: string;
      email: string;
      ip: string;
      targetTenantId: string;
      allowedTenantIds: string[];
    }
  | NextResponse
> {
  const sessionId = request.headers.get("x-session-id");
  const email = request.headers.get("x-session-email") ?? "unknown";
  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const tenantIdsHeader = request.headers.get("x-tenant-ids") ?? "";

  if (!sessionId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantIds = tenantIdsHeader.split(",").map((s) => s.trim()).filter(Boolean);
  let targetTenantId = "";

  if (request.method === "GET") {
    targetTenantId = request.nextUrl.searchParams.get("tenantId")?.trim() ?? "";
  } else {
    let body: { tenantId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    targetTenantId = (body.tenantId ?? "").trim();
  }

  if (!targetTenantId) {
    return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  }

  let allowedTenantIds = tenantIds;
  if (!tenantIds.includes(targetTenantId)) {
    const isPlatformAdmin = await canAccessAdmin(email);
    if (!isPlatformAdmin) {
      return NextResponse.json(
        { error: "Not a member of that tenant" },
        { status: 403 }
      );
    }

    const targetTenant = await getTenantById(targetTenantId);
    if (!targetTenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    allowedTenantIds = [...new Set([...tenantIds, targetTenantId])];
  }

  return {
    sessionId,
    email,
    ip,
    targetTenantId,
    allowedTenantIds,
  };
}

async function performTenantSwitch(
  sessionId: string,
  email: string,
  ip: string,
  targetTenantId: string,
  allowedTenantIds: string[]
): Promise<boolean> {
  const switched = await switchActiveTenant(
    sessionId,
    targetTenantId,
    allowedTenantIds
  );

  if (!switched) {
    return false;
  }

  await writeAuditLog({
    userEmail: email,
    ipAddress: ip,
    tenantId: targetTenantId,
    action: AuditAction.TENANT_SWITCHED,
    detail: { tenantId: targetTenantId },
  });

  return true;
}

/**
 * PATCH /api/sessions/current
 * Body: { tenantId: string }
 * Switches the active tenant for the current session.
 * The tenantId must be in the user's existing tenant membership list.
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const resolved = await resolveTenantSwitch(request);
  if (resolved instanceof NextResponse) {
    return resolved;
  }

  const switched = await performTenantSwitch(
    resolved.sessionId,
    resolved.email,
    resolved.ip,
    resolved.targetTenantId,
    resolved.allowedTenantIds
  );

  if (!switched) {
    return NextResponse.json({ error: "Failed to switch tenant" }, { status: 500 });
  }

  return NextResponse.json({ activeTenantId: resolved.targetTenantId });
}

/**
 * GET /api/sessions/current?tenantId=<id>&next=/t/<slug>
 * Switches the active tenant and redirects to the provided safe local path.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const resolved = await resolveTenantSwitch(request);
  const fallbackUrl = new URL("/select-tenant", request.url);

  if (resolved instanceof NextResponse) {
    if (resolved.status >= 400) {
      return NextResponse.redirect(fallbackUrl);
    }
    return resolved;
  }

  const switched = await performTenantSwitch(
    resolved.sessionId,
    resolved.email,
    resolved.ip,
    resolved.targetTenantId,
    resolved.allowedTenantIds
  );

  if (!switched) {
    return NextResponse.redirect(fallbackUrl);
  }

  const nextPath = request.nextUrl.searchParams.get("next") ?? "";
  const safeNextPath = nextPath.startsWith("/") ? nextPath : "/select-tenant";
  return NextResponse.redirect(new URL(safeNextPath, request.url));
}
