import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessAdmin } from "@/lib/auth/admin";
import {
  getActiveTenantPublicItem,
  listVisibleTenantsForSession,
} from "@/lib/tenant-data";

export default async function GalleryHomePage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email") ?? "";
  const activeTenantId = headerStore.get("x-active-tenant-id") ?? "";
  const tenantIds = (headerStore.get("x-tenant-ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const [activeTenant, tenants, isPlatformAdmin] = await Promise.all([
    getActiveTenantPublicItem(activeTenantId),
    listVisibleTenantsForSession({ email, tenantIds }),
    canAccessAdmin(email),
  ]);

  if (activeTenant?.slug) {
    redirect(`/t/${activeTenant.slug}`);
  }

  if (tenants.length === 1) {
    redirect(`/t/${tenants[0].slug}`);
  }

  if (tenants.length > 1) {
    redirect("/select-tenant");
  }

  if (isPlatformAdmin) {
    redirect("/admin");
  }

  redirect("/login");
}
