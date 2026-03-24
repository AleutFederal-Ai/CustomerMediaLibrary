import { NextRequest, NextResponse } from "next/server";
import { getPlatformStats } from "@/lib/admin/stats";
import { isSuperAdmin } from "@/lib/auth/permissions";

// GET /api/admin/stats — platform dashboard metrics
export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email");
  if (!email) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const isAdmin = await isSuperAdmin(email);
  if (!isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    return NextResponse.json(await getPlatformStats());
  } catch (err) {
    console.error("[admin/stats] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load stats" },
      { status: 500 }
    );
  }
}
