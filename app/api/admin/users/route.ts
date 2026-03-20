import { NextRequest, NextResponse } from "next/server";
import { users, sessions } from "@/lib/azure/cosmos";
import { writeAuditLog } from "@/lib/audit/logger";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { UserRecord, AuditAction } from "@/types";

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const email = request.headers.get("x-session-email");
  if (!email) return null;
  const isAdmin = await isSuperAdmin(email);
  return isAdmin ? email : null;
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
      ? "SELECT * FROM c WHERE CONTAINS(c.email, @search) ORDER BY c.lastLoginAt DESC"
      : "SELECT * FROM c ORDER BY c.lastLoginAt DESC";

    const iterator = container.items.query<UserRecord>(
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
      items: page.resources,
      continuationToken: page.continuationToken ?? null,
    });
  } catch (err) {
    console.error("[admin/users] GET error:", err);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

// POST /api/admin/users/block — block a user
// POST /api/admin/users/unblock — unblock a user
// Body: { email: string, action: "block" | "unblock" }
export async function POST(request: NextRequest): Promise<NextResponse> {
  const adminEmail = await requireAdmin(request);
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let body: { email?: string; action?: "block" | "unblock" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const targetEmail = (body.email ?? "").toLowerCase().trim();
  const action = body.action;

  if (!targetEmail) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  if (action !== "block" && action !== "unblock") {
    return NextResponse.json(
      { error: "action must be 'block' or 'unblock'" },
      { status: 400 }
    );
  }

  if (targetEmail === adminEmail.toLowerCase()) {
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

    if (resources.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = resources[0];
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
    const wasPlatformAdmin = user.isPlatformAdmin === true;

    if (wasPlatformAdmin === body.isPlatformAdmin) {
      return NextResponse.json({ error: `User is already ${body.isPlatformAdmin ? "a platform admin" : "not a platform admin"}` }, { status: 400 });
    }

    await container.item(user.id, user.id).patch([
      { op: "replace", path: "/isPlatformAdmin", value: body.isPlatformAdmin },
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
