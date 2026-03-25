import { redirect } from "next/navigation";
import TenantLoginWorkspace, {
  PLATFORM_ADMIN_TENANT,
} from "@/components/auth/TenantLoginWorkspace";
import { buildTenantLoginPath } from "@/lib/admin-scope";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; error?: string }>;
}) {
  const { tenant, error } = await searchParams;
  const normalizedTenant = tenant?.trim().toLowerCase();

  if (normalizedTenant) {
    const destination = new URL(buildTenantLoginPath(normalizedTenant), "http://localhost");
    if (error) {
      destination.searchParams.set("error", error);
    }
    redirect(`${destination.pathname}${destination.search}`);
  }

  return (
    <TenantLoginWorkspace
      tenant={PLATFORM_ADMIN_TENANT}
      hasError={error === "invalid"}
      heading="Platform administration sign-in"
      description="Use this path when you need the control plane, audit workflows, API health portal, or tenant administration."
      helpLabel="Choose a tenant workspace"
    />
  );
}
