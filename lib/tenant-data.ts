import { canAccessAdmin } from "@/lib/auth/admin";
import { getTenantById } from "@/lib/auth/tenant";
import { tenants as tenantsContainer } from "@/lib/azure/cosmos";
import { TenantPublicItem, TenantRecord } from "@/types";

function toTenantPublicItem(tenant: TenantRecord): TenantPublicItem {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    ...(tenant.description && { description: tenant.description }),
    ...(tenant.logoUrl && { logoUrl: tenant.logoUrl }),
    ...(tenant.brandColor && { brandColor: tenant.brandColor }),
  };
}

export async function getActiveTenantPublicItem(
  activeTenantId?: string | null
): Promise<TenantPublicItem | null> {
  if (!activeTenantId) {
    return null;
  }

  const tenant = await getTenantById(activeTenantId);
  return tenant ? toTenantPublicItem(tenant) : null;
}

export async function listVisibleTenantsForSession({
  email,
  tenantIds,
}: {
  email: string;
  tenantIds: string[];
}): Promise<TenantPublicItem[]> {
  const container = await tenantsContainer();
  const isPlatformAdmin = email ? await canAccessAdmin(email) : false;

  if (!isPlatformAdmin && tenantIds.length === 0) {
    return [];
  }

  const { resources } = await container.items
    .query<TenantRecord>({
      query: isPlatformAdmin
        ? "SELECT * FROM c WHERE c.isActive = true ORDER BY c.name ASC"
        : `SELECT * FROM c WHERE c.id IN (${tenantIds
            .map((_, index) => `@t${index}`)
            .join(", ")}) AND c.isActive = true ORDER BY c.name ASC`,
      parameters: isPlatformAdmin
        ? []
        : tenantIds.map((id, index) => ({ name: `@t${index}`, value: id })),
    })
    .fetchAll();

  return resources.map(toTenantPublicItem);
}
