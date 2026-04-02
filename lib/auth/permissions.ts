import { canAccessAdmin } from "@/lib/auth/admin";
import { memberships } from "@/lib/azure/cosmos";
import { logDebug, logWarn, logError } from "@/lib/logging/structured";
import { MembershipRecord } from "@/types";

/**
 * Returns true if the user is a global super admin.
 * Checks Cosmos DB isPlatformAdmin flag first, then Entra ID group membership.
 */
export async function isSuperAdmin(email: string): Promise<boolean> {
  const result = await canAccessAdmin(email);
  logDebug("auth.isSuperAdmin", { email, result });
  return result;
}

/**
 * Returns true if the user can administrate the given tenant.
 * Passes for:
 *   - Global super admins (Entra group)
 *   - Users with role="admin" in the tenant's memberships
 */
export async function isTenantAdmin(
  email: string,
  tenantId: string
): Promise<boolean> {
  // Super admins can manage any tenant
  if (await isSuperAdmin(email)) {
    logDebug("auth.isTenantAdmin.super_admin", { email, tenantId, result: true });
    return true;
  }

  try {
    const container = await memberships();
    const { resources } = await container.items
      .query<MembershipRecord>({
        query:
          "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.userEmail = @email AND c.role = 'admin' AND c.isActive = true",
        parameters: [
          { name: "@tenantId", value: tenantId },
          { name: "@email", value: email.toLowerCase() },
        ],
      })
      .fetchAll();
    const result = resources.length > 0;
    logDebug("auth.isTenantAdmin.membership", { email, tenantId, result, matchCount: resources.length });
    return result;
  } catch (err) {
    logError("auth.isTenantAdmin.error", {
      email,
      tenantId,
      error: err,
      hint: "Membership query failed — denying access (fail closed)",
    });
    return false;
  }
}

/**
 * Returns true if the user has any active membership in the given tenant
 * (viewer, contributor, or admin). Use this for gallery access checks.
 */
export async function isTenantMember(
  email: string,
  tenantId: string,
  tenantIds: string[]
): Promise<boolean> {
  return tenantIds.includes(tenantId);
}

/**
 * Returns true if the user can upload, edit, or delete media in the given tenant.
 * Passes for:
 *   - Global super admins (Entra group)
 *   - Tenant admins (role="admin")
 *   - Media contributors (role="contributor")
 */
export async function isMediaContributor(
  email: string,
  tenantId: string
): Promise<boolean> {
  // Admins can also contribute
  if (await isTenantAdmin(email, tenantId)) {
    logDebug("auth.isMediaContributor.admin_pass", { email, tenantId });
    return true;
  }

  try {
    const container = await memberships();
    const { resources } = await container.items
      .query<MembershipRecord>({
        query:
          "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.userEmail = @email AND c.role = 'contributor' AND c.isActive = true",
        parameters: [
          { name: "@tenantId", value: tenantId },
          { name: "@email", value: email.toLowerCase() },
        ],
      })
      .fetchAll();
    const result = resources.length > 0;
    logDebug("auth.isMediaContributor.membership", { email, tenantId, result, matchCount: resources.length });
    if (!result) {
      logWarn("auth.isMediaContributor.denied", {
        email,
        tenantId,
        hint: "User is not a super-admin, tenant admin, or contributor for this tenant",
      });
    }
    return result;
  } catch (err) {
    logError("auth.isMediaContributor.error", {
      email,
      tenantId,
      error: err,
      hint: "Membership query failed — denying access (fail closed)",
    });
    return false;
  }
}
