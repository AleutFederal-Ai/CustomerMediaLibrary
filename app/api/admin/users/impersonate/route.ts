import { NextRequest, NextResponse } from "next/server";
import { users, memberships } from "@/lib/azure/cosmos";
import {
  beginUserImpersonation,
  endUserImpersonation,
} from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { logInfo, logWarn, logError } from "@/lib/logging/structured";
import { MembershipRecord, UserRecord, AuditAction } from "@/types";

async function requirePlatformAdmin(request: NextRequest): Promise<string | null> {
  const email = request.headers.get("x-session-email");
  if (!email) return null;
  return (await isSuperAdmin(email)) ? email : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const actorEmail = await requirePlatformAdmin(request);
  if (!actorEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionId = request.headers.get("x-session-id") ?? "";
  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const actorActiveTenantId = request.headers.get("x-active-tenant-id") ?? undefined;
  const actorTenantIds = (request.headers.get("x-tenant-ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!sessionId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { email?: string; tenantId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const targetEmail = (body.email ?? "").toLowerCase().trim();
  const targetTenantId = (body.tenantId ?? "").trim();

  if (!targetEmail || !targetTenantId) {
    return NextResponse.json({ error: "email and tenantId are required" }, { status: 400 });
  }

  if (targetEmail === actorEmail.toLowerCase()) {
    return NextResponse.json({ error: "Cannot impersonate your own account" }, { status: 400 });
  }

  try {
    const usersContainer = await users();
    const { resources: userRows } = await usersContainer.items
      .query<UserRecord>({
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: targetEmail }],
      })
      .fetchAll();

    if (userRows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (userRows[0].isBlocked) {
      return NextResponse.json({ error: "Blocked users cannot be impersonated" }, { status: 400 });
    }

    const membershipsContainer = await memberships();
    const { resources: targetMemberships } = await membershipsContainer.items
      .query<MembershipRecord>({
        query:
          "SELECT c.tenantId FROM c WHERE c.userEmail = @email AND c.isActive = true",
        parameters: [{ name: "@email", value: targetEmail }],
      })
      .fetchAll();

    const targetTenantIds = [...new Set(targetMemberships.map((row) => row.tenantId))];
    if (!targetTenantIds.includes(targetTenantId)) {
      return NextResponse.json(
        { error: "User does not have active membership in the selected tenant" },
        { status: 400 }
      );
    }

    const impersonated = await beginUserImpersonation(
      sessionId,
      actorEmail,
      targetEmail,
      targetTenantId,
      targetTenantIds,
      actorActiveTenantId,
      actorTenantIds
    );

    if (!impersonated) {
      logError("admin.users.impersonation.start_failed", {
        actorEmail,
        targetEmail,
        targetTenantId,
      });
      return NextResponse.json({ error: "Failed to start impersonation" }, { status: 500 });
    }

    await writeAuditLog({
      userEmail: actorEmail,
      ipAddress: ip,
      tenantId: targetTenantId,
      action: AuditAction.USER_IMPERSONATION_STARTED,
      detail: { targetEmail, targetTenantId },
    });

    logInfo("admin.users.impersonation.started", {
      actorEmail,
      targetEmail,
      targetTenantId,
    });

    return NextResponse.json({
      success: true,
      impersonating: targetEmail,
      tenantId: targetTenantId,
    });
  } catch (error) {
    logError("admin.users.impersonation.start_error", {
      actorEmail,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Failed to start impersonation" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.headers.get("x-session-id") ?? "";
  const impersonatorEmail = request.headers.get("x-impersonator-email")?.toLowerCase() ?? "";
  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const actorActiveTenantId = request.headers.get("x-active-tenant-id") ?? undefined;
  const actorTenantIds = (request.headers.get("x-tenant-ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!sessionId || !impersonatorEmail) {
    logWarn("admin.users.impersonation.end_forbidden", {
      sessionIdPresent: Boolean(sessionId),
      hasImpersonatorHeader: Boolean(impersonatorEmail),
    });
    return NextResponse.json({ error: "No active impersonation session" }, { status: 400 });
  }

  const ended = await endUserImpersonation(
    sessionId,
    impersonatorEmail,
    actorActiveTenantId,
    actorTenantIds
  );

  if (!ended) {
    return NextResponse.json({ error: "Failed to stop impersonation" }, { status: 500 });
  }

  await writeAuditLog({
    userEmail: impersonatorEmail,
    ipAddress: ip,
    tenantId: actorActiveTenantId,
    action: AuditAction.USER_IMPERSONATION_ENDED,
    detail: {},
  });

  logInfo("admin.users.impersonation.ended", {
    impersonatorEmail,
  });

  return NextResponse.json({ success: true });
}
