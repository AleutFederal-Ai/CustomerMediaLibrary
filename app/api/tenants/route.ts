import { NextRequest, NextResponse } from "next/server";
import { tenants as tenantsContainer } from "@/lib/azure/cosmos";
import { TenantRecord, TenantListItem } from "@/types";

/**
 * GET /api/tenants
 * Returns the list of tenants the authenticated user belongs to.
 * The user's tenant IDs come from the session (set at login by getUserTenantIds).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenantIdsHeader = request.headers.get("x-tenant-ids") ?? "";
  const tenantIds = tenantIdsHeader
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (tenantIds.length === 0) {
    return NextResponse.json([] as TenantListItem[]);
  }

  try {
    const container = await tenantsContainer();

    // Fetch all tenants whose IDs are in the user's list
    const { resources } = await container.items
      .query<TenantRecord>({
        query: `SELECT * FROM c WHERE c.id IN (${tenantIds.map((_, i) => `@t${i}`).join(", ")}) AND c.isActive = true ORDER BY c.name ASC`,
        parameters: tenantIds.map((id, i) => ({ name: `@t${i}`, value: id })),
      })
      .fetchAll();

    const items: TenantListItem[] = resources.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      isActive: t.isActive,
      createdAt: t.createdAt,
    }));

    return NextResponse.json(items);
  } catch (err) {
    console.error("[tenants] GET error:", err);
    return NextResponse.json({ error: "Failed to load tenants" }, { status: 500 });
  }
}
