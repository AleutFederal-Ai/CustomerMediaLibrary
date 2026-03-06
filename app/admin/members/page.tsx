import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminGroupMember } from "@/lib/azure/graph";
import { memberships } from "@/lib/azure/cosmos";
import { MembershipRecord } from "@/types";
import MemberManager from "@/components/admin/MemberManager";

async function getMembers(tenantId: string): Promise<MembershipRecord[]> {
  const container = await memberships();
  const { resources } = await container.items
    .query<MembershipRecord>({
      query: "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.isActive = true ORDER BY c.addedAt DESC",
      parameters: [{ name: "@tenantId", value: tenantId }],
    })
    .fetchAll();
  return resources;
}

export default async function AdminMembersPage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");
  const tenantId = headerStore.get("x-active-tenant-id") ?? "";

  if (!email) redirect("/login");
  const isAdmin = await isAdminGroupMember(email);
  if (!isAdmin) redirect("/");

  const memberList = await getMembers(tenantId);

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-white text-sm transition-colors">
          ← Admin
        </Link>
        <h1 className="text-white font-semibold">Members</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <MemberManager initialMembers={memberList} tenantId={tenantId} />
      </main>
    </div>
  );
}
