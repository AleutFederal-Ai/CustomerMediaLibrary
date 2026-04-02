import { NextRequest, NextResponse } from "next/server";
import { getPlatformStats } from "@/lib/admin/stats";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { withRouteLogging, logWarn, logError } from "@/lib/logging/structured";

// GET /api/admin/stats — platform dashboard metrics
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email");
  if (!email) {
    logWarn("admin.stats.GET.forbidden", { email: null, reason: "Missing session email" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isAdmin = await isSuperAdmin(email);
  if (!isAdmin) {
    logWarn("admin.stats.GET.forbidden", { email, reason: "Not a super admin" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(await getPlatformStats());
  } catch (err) {
    logError("admin.stats.GET.error", { error: err });
    return NextResponse.json(
      { error: "Failed to load stats" },
      { status: 500 }
    );
  }
}

export const GET = withRouteLogging("admin.stats.GET", handleGet);
