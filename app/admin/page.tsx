import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminGroupMember } from "@/lib/azure/graph";

export default async function AdminDashboard() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");

  if (!email) redirect("/login");

  const isAdmin = await isAdminGroupMember(email);
  if (!isAdmin) redirect("/");

  const sections = [
    { href: "/admin/upload", label: "Upload Media", description: "Add photos and videos to albums" },
    { href: "/admin/albums", label: "Manage Albums", description: "Create, edit, and delete albums" },
    { href: "/admin/users", label: "Manage Users", description: "View users, block or unblock access" },
    { href: "/admin/audit-logs", label: "Audit Logs", description: "Review all system activity" },
  ];

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            ← Gallery
          </Link>
          <h1 className="text-white font-semibold">Admin</h1>
        </div>
        <span className="text-slate-400 text-sm">{email}</span>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h2 className="text-slate-300 text-sm font-medium uppercase tracking-wider mb-6">
          Administration
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sections.map((s) => (
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
      </main>
    </div>
  );
}
