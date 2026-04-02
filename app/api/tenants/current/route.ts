import { NextRequest, NextResponse } from "next/server";
import { getTenantById } from "@/lib/auth/tenant";
import { TenantPublicItem } from "@/types";
import { withRouteLogging } from "@/lib/logging/structured";

/**
 * GET /api/tenants/current
 * Returns the active tenant's display info for the current session.
 * Used by the gallery and admin headers to show tenant branding.
 */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const activeTenantId = request.headers.get("x-active-tenant-id") ?? "";

  if (!activeTenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 404 });
  }

  const tenant = await getTenantById(activeTenantId);

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const item: TenantPublicItem = {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    ...(tenant.description && { description: tenant.description }),
    ...(tenant.logoUrl && { logoUrl: tenant.logoUrl }),
    ...(tenant.brandColor && { brandColor: tenant.brandColor }),
  };

  return NextResponse.json(item);
}

export const GET = withRouteLogging("tenants.current.GET", handleGet);
