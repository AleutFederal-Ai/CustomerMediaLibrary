import { redirect } from "next/navigation";
import TenantLoginWorkspace from "@/components/auth/TenantLoginWorkspace";
import { getTenantBySlug } from "@/lib/auth/tenant";
import { TenantPublicItem } from "@/types";

export default async function TenantLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const tenant = await getTenantBySlug(slug.toLowerCase());

  if (!tenant) {
    redirect("/select-tenant");
  }

  const tenantItem: TenantPublicItem = {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    ...(tenant.description && { description: tenant.description }),
    ...(tenant.logoUrl && { logoUrl: tenant.logoUrl }),
    ...(tenant.brandColor && { brandColor: tenant.brandColor }),
  };

  return (
    <TenantLoginWorkspace
      tenant={tenantItem}
      hasError={error === "invalid"}
    />
  );
}
