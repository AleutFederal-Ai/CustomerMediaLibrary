import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessAdmin } from "@/lib/auth/admin";
import { TenantPublicItem } from "@/types";

export default async function GalleryHomePage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email") ?? "";
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const baseHeaders = { cookie: headerStore.get("cookie") ?? "" };

  async function getActiveTenant(): Promise<TenantPublicItem | null> {
    const res = await fetch(`${proto}://${host}/api/tenants/current`, {
      headers: baseHeaders,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function getTenantOptions(): Promise<TenantPublicItem[]> {
    const res = await fetch(`${proto}://${host}/api/tenants`, {
      headers: baseHeaders,
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  }

  const [activeTenant, tenants, isPlatformAdmin] = await Promise.all([
    getActiveTenant(),
    getTenantOptions(),
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
