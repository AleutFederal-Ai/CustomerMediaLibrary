import { NextRequest, NextResponse } from "next/server";
import { users } from "@/lib/azure/cosmos";
import { writeAuditLog } from "@/lib/audit/logger";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getUserRecordByEmail } from "@/lib/profile";
import { AuditAction } from "@/types";
import { withRouteLogging, logWarn, logError } from "@/lib/logging/structured";

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email") ?? "";
  const ip = request.headers.get("x-client-ip") ?? "unknown";

  if (!email) {
    logWarn("me.password.POST.unauthorized", { reason: "no email header" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const nextPassword =
    typeof body.nextPassword === "string" ? body.nextPassword : "";

  if (!nextPassword) {
    return NextResponse.json(
      { error: "New password is required" },
      { status: 400 }
    );
  }

  if (nextPassword.length < 12) {
    return NextResponse.json(
      { error: "Password must be at least 12 characters" },
      { status: 400 }
    );
  }

  try {
    const user = await getUserRecordByEmail(email);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.passwordHash) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }

      const matches = await verifyPassword(currentPassword, user.passwordHash);
      if (!matches) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }
    }

    const passwordHash = await hashPassword(nextPassword);
    const container = await users();
    await container.item(user.id, user.id).patch([
      { op: "add", path: "/passwordHash", value: passwordHash },
    ]);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.PASSWORD_SET,
      detail: {
        source: "self-service",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("me.password.POST.failed", { email, error });
    return NextResponse.json(
      { error: "Failed to update password" },
      { status: 500 }
    );
  }
}

export const POST = withRouteLogging("me.password.POST", handlePost);
