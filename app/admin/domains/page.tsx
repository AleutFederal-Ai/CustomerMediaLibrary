import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canAccessAdmin } from "@/lib/auth/admin";
import { domains } from "@/lib/azure/cosmos";
import { DomainRecord, TenantPublicItem } from "@/types";
import DomainManager from "@/components/admin/DomainManager";

async function getDomains(tenantId: string): Promise<DomainRecord[]> {
  const container = await domains();
  const { resources } = await container.items
    .query<DomainRecord>({
      query:
        "SELECT * FROM c WHERE c.tenantId = @tenantId ORDER BY c.addedAt DESC",
      parameters: [{ name: "@tenantId", value: tenantId }],
    })
    .fetchAll();
  return resources;
}

export default async function AdminDomainsPage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");
  const tenantId = headerStore.get("x-active-tenant-id") ?? "";
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";

  if (!email) redirect("/login");
  const isAdmin = await canAccessAdmin(email);
  if (!isAdmin) redirect("/");

  const [domainList, activeTenant] = await Promise.all([
    getDomains(tenantId),
    fetch(`${proto}://${host}/api/tenants/current`, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store",
    })
      .then((r) =>
        r.ok ? (r.json() as Promise<TenantPublicItem>) : null
      )
      .catch(() => null),
  ]);

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-4">
        <Link
          href="/admin"
          className="text-slate-400 hover:text-white text-sm transition-colors"
        >
          &larr; Admin
        </Link>
        <h1 className="text-white font-semibold">
          Domains{activeTenant ? ` \u2014 ${activeTenant.name}` : ""}
        </h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <DomainManager initialDomains={domainList} tenantId={tenantId} />
      </main>
    </div>
  );
}
