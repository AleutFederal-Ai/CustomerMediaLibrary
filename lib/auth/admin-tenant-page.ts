import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantBySlug } from "@/lib/auth/tenant";
import { buildAdminTenantPath } from "@/lib/admin-scope";

interface AdminTenantPageContext {
  headerStore: Awaited<ReturnType<typeof headers>>;
  email: string;
  activeTenantId: string;
  requestedTenantSlug?: string;
  host: string;
  proto: string;
  cookieHeader: string;
}

export async function getAdminTenantPageContext({
  currentPath,
  requestedTenantSlug,
}: {
  currentPath: string;
  requestedTenantSlug?: string;
}): Promise<AdminTenantPageContext> {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");
  const currentActiveTenantId = headerStore.get("x-active-tenant-id") ?? "";
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const cookieHeader = headerStore.get("cookie") ?? "";

  if (!email) {
    redirect("/login");
  }

  const normalizedTenantSlug = requestedTenantSlug?.trim().toLowerCase();

  if (normalizedTenantSlug) {
    const targetTenant = await getTenantBySlug(normalizedTenantSlug);

    if (!targetTenant) {
      redirect("/admin");
    }

    if (currentActiveTenantId !== targetTenant.id) {
      redirect(
        `/api/sessions/current?tenantId=${encodeURIComponent(targetTenant.id)}&next=${encodeURIComponent(buildAdminTenantPath(currentPath, targetTenant.slug))}`
      );
    }

    return {
      headerStore,
      email,
      activeTenantId: targetTenant.id,
      requestedTenantSlug: targetTenant.slug,
      host,
      proto,
      cookieHeader,
    };
  }

  return {
    headerStore,
    email,
    activeTenantId: currentActiveTenantId,
    host,
    proto,
    cookieHeader,
  };
}
