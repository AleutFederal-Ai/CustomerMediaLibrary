import { domains } from "@/lib/azure/cosmos";
import { DomainRecord } from "@/types";

/**
 * Check if an email's domain is on the permitted domains list in Cosmos DB.
 * Returns false for any error — fail closed.
 */
export async function isDomainAllowed(email: string): Promise<boolean> {
  try {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return false;

    const container = await domains();
    const { resources } = await container.items
      .query<DomainRecord>({
        query:
          "SELECT * FROM c WHERE c.domain = @domain AND c.isActive = true",
        parameters: [{ name: "@domain", value: domain }],
      })
      .fetchAll();

    return resources.length > 0;
  } catch {
    return false;
  }
}
