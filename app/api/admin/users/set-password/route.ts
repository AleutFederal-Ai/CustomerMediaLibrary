import { NextRequest, NextResponse } from "next/server";
import { users } from "@/lib/azure/cosmos";
import { hashPassword } from "@/lib/auth/password";
import { writeAuditLog } from "@/lib/audit/logger";
import { isAdminGroupMember } from "@/lib/azure/graph";
import { AuditAction, UserRecord } from "@/types";

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const email = request.headers.get("x-session-email");
  if (!email) return null;
  const isAdmin = await isAdminGroupMember(email);
  return isAdmin ? email : null;
}

// POST /api/admin/users/set-password
// Body: { email: string; password: string }
// Allows an admin to assign (or reset) a password for any existing user.
// The user must already exist (i.e. have logged in at least once via magic link).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const adminEmail = await requireAdmin(request);
  if (!adminEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const targetEmail =
    typeof b.email === "string" ? b.email.toLowerCase().trim() : "";
  const password = typeof b.password === "string" ? b.password : "";

  if (!targetEmail || !password) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400 }
    );
  }

  // Enforce minimum password length
  if (password.length < 12) {
    return NextResponse.json(
      { error: "Password must be at least 12 characters" },
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
      return NextResponse.json(
        { error: "User not found — user must log in via magic link first" },
        { status: 404 }
      );
    }

    const user = resources[0];
    const passwordHash = await hashPassword(password);

    await container.item(user.id, user.id).patch([
      { op: "replace", path: "/passwordHash", value: passwordHash },
    ]);

    await writeAuditLog({
      userEmail: adminEmail,
      ipAddress: ip,
      action: AuditAction.PASSWORD_SET,
      detail: { targetEmail },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/users/set-password] error:", err);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
