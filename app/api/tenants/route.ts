import { NextRequest, NextResponse } from "next/server";
import { canAccessAdmin } from "@/lib/auth/admin";
import { tenants as tenantsContainer } from "@/lib/azure/cosmos";
import { TenantRecord, TenantListItem } from "@/types";

/**
 * GET /api/tenants
 * Returns the list of tenants the authenticated user belongs to.
 * The user's tenant IDs come from the session (set at login by getUserTenantIds).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email") ?? "";
  const tenantIdsHeader = request.headers.get("x-tenant-ids") ?? "";
  const tenantIds = tenantIdsHeader
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const container = await tenantsContainer();
    const isPlatformAdmin = email ? await canAccessAdmin(email) : false;

    if (!isPlatformAdmin && tenantIds.length === 0) {
      return NextResponse.json([] as TenantListItem[]);
    }

    const { resources } = await container.items
      .query<TenantRecord>({
        query: isPlatformAdmin
          ? "SELECT * FROM c WHERE c.isActive = true ORDER BY c.name ASC"
          : `SELECT * FROM c WHERE c.id IN (${tenantIds
              .map((_, i) => `@t${i}`)
              .join(", ")}) AND c.isActive = true ORDER BY c.name ASC`,
        parameters: isPlatformAdmin
          ? []
          : tenantIds.map((id, i) => ({ name: `@t${i}`, value: id })),
      })
      .fetchAll();

    const items: TenantListItem[] = resources.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      isPublic: t.isPublic ?? false,
      isActive: t.isActive,
      ...(t.description && { description: t.description }),
      ...(t.logoUrl && { logoUrl: t.logoUrl }),
      ...(t.brandColor && { brandColor: t.brandColor }),
      createdAt: t.createdAt,
    }));

    return NextResponse.json(items);
  } catch (err) {
    console.error("[tenants] GET error:", err);
    return NextResponse.json({ error: "Failed to load tenants" }, { status: 500 });
  }
}
