import { redirect } from "next/navigation";
import TenantLoginWorkspace, {
  PLATFORM_ADMIN_TENANT,
} from "@/components/auth/TenantLoginWorkspace";
import { buildTenantLoginPath } from "@/lib/admin-scope";
import { sanitizeNextPath } from "@/lib/auth/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; error?: string; next?: string }>;
}) {
  const { tenant, error, next } = await searchParams;
  const normalizedTenant = tenant?.trim().toLowerCase();
  const safeNextPath = sanitizeNextPath(next);

  if (normalizedTenant) {
    const destination = new URL(buildTenantLoginPath(normalizedTenant), "http://localhost");
    if (error) {
      destination.searchParams.set("error", error);
    }
    if (safeNextPath) {
      destination.searchParams.set("next", safeNextPath);
    }
    redirect(`${destination.pathname}${destination.search}`);
  }

  return (
    <TenantLoginWorkspace
      tenant={PLATFORM_ADMIN_TENANT}
      hasError={error === "invalid" || error === "server"}
      errorKind={error === "server" ? "server" : "invalid"}
      heading="Platform administration sign-in"
      description="Use this path when you need the control plane, audit workflows, API health portal, or tenant administration."
      helpLabel="Choose a tenant workspace"
      nextPath={safeNextPath}
    />
  );
}
