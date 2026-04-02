import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { memberships } from "@/lib/azure/cosmos";
import { writeAuditLog } from "@/lib/audit/logger";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { MembershipRecord, AuditAction, MemberRole } from "@/types";
import { withRouteLogging, logWarn, logError } from "@/lib/logging/structured";

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

async function requireTenantAdmin(
  request: NextRequest
): Promise<{ email: string; tenantId: string } | null> {
  const email = request.headers.get("x-session-email");
  if (!email) return null;
  const tenantId =
    request.nextUrl.searchParams.get("tenantId") ||
    request.headers.get("x-active-tenant-id") ||
    "";
  if (!tenantId) return null;
  const ok = await isTenantAdmin(email, tenantId);
  return ok ? { email, tenantId } : null;
}

// GET /api/admin/members?tenantId=<id> — list members of a tenant
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) {
    const email = request.headers.get("x-session-email");
    logWarn("admin.members.GET.forbidden", { email, reason: "Not a tenant admin or missing tenant" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const container = await memberships();
    const { resources } = await container.items
      .query<MembershipRecord>({
        query:
          "SELECT * FROM c WHERE c.tenantId = @tenantId ORDER BY c.addedAt DESC",
        parameters: [{ name: "@tenantId", value: caller.tenantId }],
      })
      .fetchAll();

    return NextResponse.json(resources);
  } catch (err) {
    logError("admin.members.GET.error", { tenantId: caller.tenantId, error: err });
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}

// POST /api/admin/members — add an explicit member to a tenant
// Body: { userEmail: string, role?: "viewer" | "admin" }
async function handlePost(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) {
    const email = request.headers.get("x-session-email");
    logWarn("admin.members.POST.forbidden", { email, reason: "Not a tenant admin or missing tenant" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let body: { userEmail?: string; role?: MemberRole };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const userEmail = (body.userEmail ?? "").toLowerCase().trim();
  const role: MemberRole =
    body.role === "admin" ? "admin" :
    body.role === "contributor" ? "contributor" :
    "viewer";

  if (!userEmail || !EMAIL_RE.test(userEmail)) {
    return NextResponse.json({ error: "Valid userEmail is required" }, { status: 400 });
  }

  try {
    const container = await memberships();

    // Check for existing membership
    const { resources: existing } = await container.items
      .query<MembershipRecord>({
        query:
          "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.userEmail = @email",
        parameters: [
          { name: "@tenantId", value: caller.tenantId },
          { name: "@email", value: userEmail },
        ],
      })
      .fetchAll();

    if (existing.length > 0) {
      const dup = existing[0];
      if (dup.isActive && dup.role === role) {
        return NextResponse.json({ error: "Member already exists with this role" }, { status: 409 });
      }
      // Update role or re-activate
      await container.item(dup.id, dup.id).patch([
        { op: "replace", path: "/isActive", value: true },
        { op: "replace", path: "/role", value: role },
        { op: "replace", path: "/addedBy", value: caller.email },
        { op: "replace", path: "/addedAt", value: new Date().toISOString() },
      ]);

      await writeAuditLog({
        userEmail: caller.email,
        ipAddress: ip,
        tenantId: caller.tenantId,
        action: AuditAction.MEMBER_ADDED,
        detail: { targetEmail: userEmail, role, updated: true },
      });

      return NextResponse.json({ ...dup, isActive: true, role });
    }

    const record: MembershipRecord = {
      id: uuidv4(),
      tenantId: caller.tenantId,
      userEmail,
      role,
      source: "explicit",
      addedAt: new Date().toISOString(),
      addedBy: caller.email,
      isActive: true,
    };

    await container.items.create(record);

    await writeAuditLog({
      userEmail: caller.email,
      ipAddress: ip,
      tenantId: caller.tenantId,
      action: AuditAction.MEMBER_ADDED,
      detail: { targetEmail: userEmail, role },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    logError("admin.members.POST.error", { tenantId: caller.tenantId, error: err });
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}

// PATCH /api/admin/members?tenantId=<id> — change a member's role
// Body: { email: string, role: MemberRole }
async function handlePatch(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) {
    const email = request.headers.get("x-session-email");
    logWarn("admin.members.PATCH.forbidden", { email, reason: "Not a tenant admin or missing tenant" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let body: { email?: string; role?: MemberRole };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const targetEmail = (body.email ?? "").toLowerCase().trim();
  const newRole = body.role;

  if (!targetEmail || !EMAIL_RE.test(targetEmail)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  if (newRole !== "viewer" && newRole !== "contributor" && newRole !== "admin") {
    return NextResponse.json({ error: "role must be 'viewer', 'contributor', or 'admin'" }, { status: 400 });
  }

  try {
    const container = await memberships();
    const { resources } = await container.items
      .query<MembershipRecord>({
        query:
          "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.userEmail = @email AND c.isActive = true",
        parameters: [
          { name: "@tenantId", value: caller.tenantId },
          { name: "@email", value: targetEmail },
        ],
      })
      .fetchAll();

    if (resources.length === 0) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const member = resources[0];
    const oldRole = member.role;

    if (oldRole === newRole) {
      return NextResponse.json({ error: "Role is already " + newRole }, { status: 400 });
    }

    await container.item(member.id, member.id).patch([
      { op: "replace", path: "/role", value: newRole },
    ]);

    await writeAuditLog({
      userEmail: caller.email,
      ipAddress: ip,
      tenantId: caller.tenantId,
      action: AuditAction.MEMBER_ROLE_CHANGED,
      detail: { targetEmail, oldRole, newRole },
    });

    return NextResponse.json({ ...member, role: newRole });
  } catch (err) {
    logError("admin.members.PATCH.error", { tenantId: caller.tenantId, error: err });
    return NextResponse.json({ error: "Failed to update member role" }, { status: 500 });
  }
}

// DELETE /api/admin/members?tenantId=<id>&email=<email> — remove a member
async function handleDelete(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) {
    const email = request.headers.get("x-session-email");
    logWarn("admin.members.DELETE.forbidden", { email, reason: "Not a tenant admin or missing tenant" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const targetEmail = (request.nextUrl.searchParams.get("email") ?? "").toLowerCase().trim();

  if (!targetEmail) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  try {
    const container = await memberships();
    const { resources } = await container.items
      .query<MembershipRecord>({
        query:
          "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.userEmail = @email AND c.isActive = true",
        parameters: [
          { name: "@tenantId", value: caller.tenantId },
          { name: "@email", value: targetEmail },
        ],
      })
      .fetchAll();

    if (resources.length === 0) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    await container.item(resources[0].id, resources[0].id).patch([
      { op: "replace", path: "/isActive", value: false },
    ]);

    await writeAuditLog({
      userEmail: caller.email,
      ipAddress: ip,
      tenantId: caller.tenantId,
      action: AuditAction.MEMBER_REMOVED,
      detail: { targetEmail },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("admin.members.DELETE.error", { tenantId: caller.tenantId, error: err });
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}

export const GET = withRouteLogging("admin.members.GET", handleGet);
export const POST = withRouteLogging("admin.members.POST", handlePost);
export const PATCH = withRouteLogging("admin.members.PATCH", handlePatch);
export const DELETE = withRouteLogging("admin.members.DELETE", handleDelete);
