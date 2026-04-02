import { NextRequest, NextResponse } from "next/server";
import { isTenantAdmin, isMediaContributor } from "@/lib/auth/permissions";
import { withRouteLogging, logWarn } from "@/lib/logging/structured";

/**
 * GET /api/me
 * Returns the current user's email and permission flags for the active tenant.
 * Used by client components to conditionally render contributor UI.
 */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email") ?? "";
  const tenantId = request.headers.get("x-active-tenant-id") ?? "";

  if (!email) {
    logWarn("me.GET.unauthorized", { reason: "no email header" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = await isTenantAdmin(email, tenantId);
  const canContribute = isAdmin || await isMediaContributor(email, tenantId);

  return NextResponse.json({ email, isAdmin, canContribute });
}

export const GET = withRouteLogging("me.GET", handleGet);
