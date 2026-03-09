import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { memberships } from "@/lib/azure/cosmos";
import { writeAuditLog } from "@/lib/audit/logger";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { MembershipRecord, AuditAction, MemberRole } from "@/types";

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
export async function GET(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    console.error("[admin/members] GET error:", err);
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}

// POST /api/admin/members — add an explicit member to a tenant
// Body: { userEmail: string, role?: "viewer" | "admin" }
export async function POST(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    console.error("[admin/members] POST error:", err);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}

// DELETE /api/admin/members?tenantId=<id>&email=<email> — remove a member
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    console.error("[admin/members] DELETE error:", err);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
