import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminGroupMember } from "@/lib/azure/graph";
import { users } from "@/lib/azure/cosmos";
import { UserRecord } from "@/types";
import UserManager from "@/components/admin/UserManager";

async function getRecentUsers(): Promise<UserRecord[]> {
  const container = await users();
  const { resources } = await container.items
    .query<UserRecord>({
      query: "SELECT * FROM c ORDER BY c.lastLoginAt DESC OFFSET 0 LIMIT 50",
    })
    .fetchAll();
  return resources;
}

export default async function AdminUsersPage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");

  if (!email) redirect("/login");
  const isAdmin = await isAdminGroupMember(email);
  if (!isAdmin) redirect("/");

  const userList = await getRecentUsers();

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-white text-sm transition-colors">
          ← Admin
        </Link>
        <h1 className="text-white font-semibold">Users</h1>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <UserManager initialUsers={userList} />
      </main>
    </div>
  );
}
