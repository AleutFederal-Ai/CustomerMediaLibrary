import { NextResponse } from "next/server";
import { tenants } from "@/lib/azure/cosmos";
import { TenantRecord, TenantPublicItem } from "@/types";
import { withRouteLogging, logError } from "@/lib/logging/structured";

/**
 * GET /api/tenants/public
 * Returns the list of tenants with isPublic=true and isActive=true.
 * No authentication required — used by the pre-login tenant selection UI.
 */
async function handleGet(): Promise<NextResponse> {
  try {
    const container = await tenants();
    const { resources } = await container.items
      .query<TenantRecord>({
        query:
          "SELECT * FROM c WHERE c.isPublic = true AND c.isActive = true ORDER BY c.name ASC",
      })
      .fetchAll();

    const items: TenantPublicItem[] = resources.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      ...(t.description && { description: t.description }),
      ...(t.logoUrl && { logoUrl: t.logoUrl }),
      ...(t.brandColor && { brandColor: t.brandColor }),
    }));

    return NextResponse.json(items);
  } catch (err) {
    logError("tenants.public.GET.failed", { error: err });
    return NextResponse.json({ error: "Failed to load tenants" }, { status: 500 });
  }
}

export const GET = withRouteLogging("tenants.public.GET", handleGet);
