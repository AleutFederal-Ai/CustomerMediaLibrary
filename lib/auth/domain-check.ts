import { domains } from "@/lib/azure/cosmos";
import { DomainRecord } from "@/types";

export interface DomainCheckResult {
  allowed: boolean;
  tenantIds: string[];
}

/**
 * Check if an email's domain is on the permitted domains list in Cosmos DB.
 * Returns the list of tenant IDs the domain grants access to.
 * Returns { allowed: false, tenantIds: [] } for any error — fail closed.
 */
export async function isDomainAllowed(email: string): Promise<DomainCheckResult> {
  try {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return { allowed: false, tenantIds: [] };

    const container = await domains();
    const { resources } = await container.items
      .query<DomainRecord>({
        query:
          "SELECT * FROM c WHERE c.domain = @domain AND c.isActive = true",
        parameters: [{ name: "@domain", value: domain }],
      })
      .fetchAll();

    if (resources.length === 0) return { allowed: false, tenantIds: [] };
    return { allowed: true, tenantIds: resources.map((r) => r.tenantId) };
  } catch {
    return { allowed: false, tenantIds: [] };
  }
}
