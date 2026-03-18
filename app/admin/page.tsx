import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canAccessAdmin } from "@/lib/auth/admin";
import { TenantPublicItem } from "@/types";

export default async function AdminDashboard() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const tenantIds = (headerStore.get("x-tenant-ids") ?? "").split(",").filter(Boolean);

  if (!email) redirect("/login");

  const [isAdmin, activeTenant] = await Promise.all([
    canAccessAdmin(email),
    fetch(`${proto}://${host}/api/tenants/current`, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<TenantPublicItem>) : null))
      .catch(() => null),
  ]);

  if (!isAdmin) redirect("/");

  // Tenant-scoped sections (all admins)
  const tenantSections = [
    { href: "/admin/upload", label: "Upload Media", description: "Add photos and videos to albums" },
    { href: "/admin/albums", label: "Manage Albums", description: "Create, edit, and delete albums" },
    { href: "/admin/members", label: "Manage Members", description: "Assign viewer, contributor, or admin roles" },
    { href: "/admin/audit-logs", label: "Audit Logs", description: "Review all system activity" },
  ];

  // Super-admin only sections
  const superAdminSections = [
    { href: "/admin/tenants", label: "Organizations", description: "Create and manage tenant organizations" },
    { href: "/admin/users", label: "Manage Users", description: "View users, block or unblock access" },
  ];

  const brandColor = activeTenant?.brandColor ?? "#1e3a5f";

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Tenant brand bar */}
      {activeTenant?.brandColor && (
        <div className="h-1" style={{ backgroundColor: activeTenant.brandColor }} />
      )}

      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-white text-sm transition-colors">
            ← Gallery
          </Link>
          <div className="flex items-center gap-2">
            {activeTenant?.logoUrl ? (
              <img src={activeTenant.logoUrl} alt={activeTenant.name} className="w-5 h-5 rounded object-contain" />
            ) : (
              <div
                className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                {(activeTenant?.name ?? "A").charAt(0).toUpperCase()}
              </div>
            )}
            <h1 className="text-white font-semibold">
              {activeTenant ? `${activeTenant.name} — Admin` : "Admin"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {tenantIds.length > 1 && (
            <Link href="/select-tenant" className="text-slate-400 hover:text-white text-sm transition-colors">
              Switch org
            </Link>
          )}
          <span className="text-slate-400 text-sm">{email}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Tenant-scoped admin */}
        <section>
          <h2 className="text-slate-300 text-sm font-medium uppercase tracking-wider mb-4">
            {activeTenant ? activeTenant.name : "Organization"} Administration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tenantSections.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="block p-5 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-500 transition-colors group"
              >
                <h3 className="text-white font-medium group-hover:text-blue-300 transition-colors">
                  {s.label}
                </h3>
                <p className="text-slate-400 text-sm mt-1">{s.description}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* Super-admin section */}
        <section>
          <h2 className="text-slate-300 text-sm font-medium uppercase tracking-wider mb-4">
            Platform Administration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {superAdminSections.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="block p-5 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-500 transition-colors group"
              >
                <h3 className="text-white font-medium group-hover:text-blue-300 transition-colors">
                  {s.label}
                </h3>
                <p className="text-slate-400 text-sm mt-1">{s.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
