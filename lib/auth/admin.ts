import { users } from "@/lib/azure/cosmos";
import { isAdminGroupMember } from "@/lib/azure/graph";
import { logDebug, logWarn, logError } from "@/lib/logging/structured";
import { UserRecord } from "@/types";

const DEV_BYPASS_EMAIL = "dev@aleutfederal.com";

/**
 * Determine whether a user can access the admin console.
 *
 * Checks in order:
 *   1. Cosmos DB isPlatformAdmin flag — for seeded / manually-granted super-admins
 *      who may not exist in the Azure Entra ID group (e.g. admin@admin.com)
 *   2. Entra ID group membership via Microsoft Graph — for production admins
 *      managed through the myMedia-Admins group
 *
 * Fails closed: any error returns false.
 */
export async function canAccessAdmin(email: string): Promise<boolean> {
  const emailLower = email.toLowerCase();

  if (process.env.DOCKER_DEV === "true" && emailLower === DEV_BYPASS_EMAIL) {
    logDebug("auth.canAccessAdmin.dev_bypass", { email: emailLower });
    return true;
  }

  // 1. Check Cosmos DB platform admin flag
  try {
    const container = await users();
    const { resources } = await container.items
      .query<Pick<UserRecord, "isPlatformAdmin">>({
        query: "SELECT c.isPlatformAdmin FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: emailLower }],
      })
      .fetchAll();
    if (resources[0]?.isPlatformAdmin === true) {
      logDebug("auth.canAccessAdmin.cosmos_flag", { email: emailLower, result: true });
      return true;
    }
    logDebug("auth.canAccessAdmin.cosmos_flag", {
      email: emailLower,
      result: false,
      recordFound: resources.length > 0,
    });
  } catch (err) {
    logError("auth.canAccessAdmin.cosmos_error", {
      email: emailLower,
      error: err,
      hint: "Cosmos DB query for isPlatformAdmin failed — falling through to Entra ID",
    });
  }

  // 2. Fall through to Entra ID group membership
  const isEntraMember = await isAdminGroupMember(emailLower);
  logDebug("auth.canAccessAdmin.entra_check", { email: emailLower, result: isEntraMember });
  return isEntraMember;
}
