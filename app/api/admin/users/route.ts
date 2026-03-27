import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { users, sessions, memberships, tenants } from "@/lib/azure/cosmos";
import { writeAuditLog } from "@/lib/audit/logger";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { UserRecord, UserAdminListItem, AuditAction, MemberRole, MembershipRecord } from "@/types";

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const email = request.headers.get("x-session-email");
  if (!email) return null;
  const isAdmin = await isSuperAdmin(email);
  return isAdmin ? email : null;
}

function toUserAdminListItem(
  user: Pick<
    UserRecord,
    "id" | "email" | "lastLoginAt" | "loginCount" | "isBlocked" | "isPlatformAdmin"
  >
): UserAdminListItem {
  return {
    id: user.id,
    email: user.email,
    lastLoginAt: user.lastLoginAt,
    loginCount: user.loginCount,
    isBlocked: user.isBlocked,
    ...(typeof user.isPlatformAdmin === "boolean" && {
      isPlatformAdmin: user.isPlatformAdmin,
    }),
  };
}

// GET /api/admin/users?cursor=<token>&search=<email>
export async function GET(request: NextRequest): Promise<NextResponse> {
  const adminEmail = await requireAdmin(request);
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const search = request.nextUrl.searchParams.get("search")?.toLowerCase() ?? "";
  const continuationToken = request.nextUrl.searchParams.get("cursor") ?? undefined;

  try {
    const container = await users();
    const query = search
      ? "SELECT c.id, c.email, c.lastLoginAt, c.loginCount, c.isBlocked, c.isPlatformAdmin FROM c WHERE CONTAINS(c.email, @search) ORDER BY c.lastLoginAt DESC"
      : "SELECT c.id, c.email, c.lastLoginAt, c.loginCount, c.isBlocked, c.isPlatformAdmin FROM c ORDER BY c.lastLoginAt DESC";

    const iterator = container.items.query<UserAdminListItem>(
      {
        query,
        ...(search && {
          parameters: [{ name: "@search", value: search }],
        }),
      },
      { maxItemCount: 50, continuationToken }
    );

    const page = await iterator.fetchNext();

    return NextResponse.json({
      items: page.resources.map(toUserAdminListItem),
      continuationToken: page.continuationToken ?? null,
    });
  } catch (err) {
    console.error("[admin/users] GET error:", err);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

// POST /api/admin/users/block — block a user
// POST /api/admin/users/unblock — unblock a user
// Body: { email: string, action: "block" | "unblock" | "create", tenantId?: string, tenantRole?: MemberRole }
export async function POST(request: NextRequest): Promise<NextResponse> {
  const adminEmail = await requireAdmin(request);
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let body: {
    email?: string;
    action?: "block" | "unblock" | "create";
    tenantId?: string;
    tenantRole?: MemberRole;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const targetEmail = (body.email ?? "").toLowerCase().trim();
  const action = body.action;

  if (!targetEmail || !EMAIL_RE.test(targetEmail)) {
    return NextResponse.json({ error: "valid email is required" }, { status: 400 });
  }

  if (action !== "block" && action !== "unblock" && action !== "create") {
    return NextResponse.json(
      { error: "action must be 'block', 'unblock', or 'create'" },
      { status: 400 }
    );
  }

  if (targetEmail === adminEmail.toLowerCase() && action !== "create") {
    return NextResponse.json(
      { error: "Cannot block your own account" },
      { status: 400 }
    );
  }

  try {
    const container = await users();
    const { resources } = await container.items
      .query<UserRecord>({
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: targetEmail }],
      })
      .fetchAll();

    const existingUser = resources[0];
    if (action === "create") {
      const now = new Date().toISOString();
      const userRecord: UserRecord = existingUser ?? {
        id: uuidv4(),
        email: targetEmail,
        firstLoginAt: now,
        lastLoginAt: now,
        loginCount: 0,
        isBlocked: false,
        isPlatformAdmin: false,
      };

      if (!existingUser) {
        await container.items.create(userRecord);
      }

      const tenantId = (body.tenantId ?? "").trim();
      if (tenantId) {
        const tenantContainer = await tenants();
        const { resources: tenantMatches } = await tenantContainer.items
          .query<{ id: string }>({
            query: "SELECT c.id FROM c WHERE c.id = @id AND c.isActive = true",
            parameters: [{ name: "@id", value: tenantId }],
          })
          .fetchAll();

        if (tenantMatches.length === 0) {
          return NextResponse.json({ error: "Selected tenant was not found or is inactive" }, { status: 400 });
        }

        const tenantRole: MemberRole =
          body.tenantRole === "admin"
            ? "admin"
            : body.tenantRole === "contributor"
              ? "contributor"
              : "viewer";

        const membershipContainer = await memberships();
        const { resources: existingMemberships } = await membershipContainer.items
          .query<MembershipRecord>({
            query:
              "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.userEmail = @email",
            parameters: [
              { name: "@tenantId", value: tenantId },
              { name: "@email", value: targetEmail },
            ],
          })
          .fetchAll();

        if (existingMemberships.length > 0) {
          await membershipContainer.item(existingMemberships[0].id, existingMemberships[0].id).patch([
            { op: "replace", path: "/isActive", value: true },
            { op: "replace", path: "/role", value: tenantRole },
            { op: "replace", path: "/addedBy", value: adminEmail },
            { op: "replace", path: "/addedAt", value: now },
          ]);
        } else {
          const membership: MembershipRecord = {
            id: uuidv4(),
            tenantId,
            userEmail: targetEmail,
            role: tenantRole,
            source: "explicit",
            addedAt: now,
            addedBy: adminEmail,
            isActive: true,
          };
          await membershipContainer.items.create(membership);
        }
      }

      await writeAuditLog({
        userEmail: adminEmail,
        ipAddress: ip,
        action: AuditAction.USER_CREATED,
        detail: {
          targetEmail,
          created: !existingUser,
          tenantId: body.tenantId ?? null,
          tenantRole: body.tenantRole ?? null,
        },
      });

      return NextResponse.json({ success: true, created: !existingUser });
    }

    if (resources.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = existingUser;
    const now = new Date().toISOString();

    const updated: UserRecord = {
      ...user,
      isBlocked: action === "block",
      ...(action === "block" && {
        blockedAt: now,
        blockedBy: adminEmail,
      }),
      ...(action === "unblock" && {
        blockedAt: undefined,
        blockedBy: undefined,
      }),
    };

    await container.item(user.id, user.id).replace(updated);

    // If blocking, revoke all active sessions immediately
    if (action === "block") {
      const sessionsContainer = await sessions();
      const { resources: activeSessions } = await sessionsContainer.items
        .query({
          query:
            "SELECT * FROM c WHERE c.email = @email AND c.type = 'session' AND c.expiresAt > @now",
          parameters: [
            { name: "@email", value: targetEmail },
            { name: "@now", value: now },
          ],
        })
        .fetchAll();

      await Promise.all(
        activeSessions.map((s: { id: string }) =>
          sessionsContainer.item(s.id, s.id).patch([
            { op: "replace", path: "/expiresAt", value: new Date(0).toISOString() },
          ])
        )
      );
    }

    await writeAuditLog({
      userEmail: adminEmail,
      ipAddress: ip,
      action:
        action === "block" ? AuditAction.USER_BLOCKED : AuditAction.USER_UNBLOCKED,
      detail: { targetEmail },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/users] POST error:", err);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}

// PATCH /api/admin/users — update user fields (e.g. promote/demote platform admin)
// Body: { email: string, isPlatformAdmin?: boolean }
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const adminEmail = await requireAdmin(request);
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let body: { email?: string; isPlatformAdmin?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const targetEmail = (body.email ?? "").toLowerCase().trim();
  if (!targetEmail) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  if (typeof body.isPlatformAdmin !== "boolean") {
    return NextResponse.json({ error: "isPlatformAdmin (boolean) is required" }, { status: 400 });
  }

  if (targetEmail === adminEmail.toLowerCase() && !body.isPlatformAdmin) {
    return NextResponse.json({ error: "Cannot demote your own account" }, { status: 400 });
  }

  try {
    const container = await users();
    const { resources } = await container.items
      .query<UserRecord>({
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: targetEmail }],
      })
      .fetchAll();

    if (resources.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = resources[0];
    // Use "add" instead of "replace" — "replace" fails if the property
    // doesn't exist yet on the document (users created before this field).
    // "add" creates or overwrites the property in both cases.
    await container.item(user.id, user.id).patch([
      { op: "add", path: "/isPlatformAdmin", value: body.isPlatformAdmin },
    ]);

    await writeAuditLog({
      userEmail: adminEmail,
      ipAddress: ip,
      action: AuditAction.USER_PROMOTED,
      detail: {
        targetEmail,
        isPlatformAdmin: body.isPlatformAdmin,
        action: body.isPlatformAdmin ? "promoted" : "demoted",
      },
    });

    return NextResponse.json({ success: true, isPlatformAdmin: body.isPlatformAdmin });
  } catch (err) {
    console.error("[admin/users] PATCH error:", err);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
