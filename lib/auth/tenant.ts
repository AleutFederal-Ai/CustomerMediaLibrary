import { domains, memberships, tenants as tenantsContainer } from "@/lib/azure/cosmos";
import { DomainRecord, MembershipRecord, TenantRecord } from "@/types";

/**
 * Resolve all tenant IDs accessible to a user.
 * Combines:
 *   1. Domain-based access — any active domain record matching the user's email domain
 *   2. Explicit memberships — any active MembershipRecord for the user's email
 *
 * Called at session creation time. Fails open on partial errors.
 */
export async function getUserTenantIds(email: string): Promise<string[]> {
  const emailLower = email.toLowerCase();
  const domain = emailLower.split("@")[1];
  const tenantIdSet = new Set<string>();

  // 1. Domain-based access
  if (domain) {
    try {
      const container = await domains();
      const { resources } = await container.items
        .query<Pick<DomainRecord, "tenantId">>({
          query:
            "SELECT c.tenantId FROM c WHERE c.domain = @domain AND c.isActive = true",
          parameters: [{ name: "@domain", value: domain }],
        })
        .fetchAll();
      resources.forEach((r) => tenantIdSet.add(r.tenantId));
    } catch {
      // Fail open — domain lookup failure should not block login
    }
  }

  // 2. Explicit membership grants (cross-partition query — acceptable at login time)
  try {
    const container = await memberships();
    const { resources } = await container.items
      .query<Pick<MembershipRecord, "tenantId">>({
        query:
          "SELECT c.tenantId FROM c WHERE c.userEmail = @email AND c.isActive = true",
        parameters: [{ name: "@email", value: emailLower }],
      })
      .fetchAll();
    resources.forEach((r) => tenantIdSet.add(r.tenantId));
  } catch {
    // Fail open
  }

  return [...tenantIdSet];
}

/**
 * Look up a single tenant by ID. Returns null if not found or inactive.
 */
export async function getTenantById(tenantId: string): Promise<TenantRecord | null> {
  try {
    const container = await tenantsContainer();
    const { resource } = await container
      .item(tenantId, tenantId)
      .read<TenantRecord>();
    if (!resource || !resource.isActive) { return null; }
    return resource;
  } catch {
    return null;
  }
}

/**
 * Look up a tenant by its URL slug. Returns null if not found.
 */
export async function getTenantBySlug(slug: string): Promise<TenantRecord | null> {
  try {
    const container = await tenantsContainer();
    const { resources } = await container.items
      .query<TenantRecord>({
        query: "SELECT * FROM c WHERE c.slug = @slug AND c.isActive = true",
        parameters: [{ name: "@slug", value: slug }],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}
