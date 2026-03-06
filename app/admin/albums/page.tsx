import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminGroupMember } from "@/lib/azure/graph";
import { albums } from "@/lib/azure/cosmos";
import { AlbumRecord } from "@/types";
import AlbumManager from "@/components/admin/AlbumManager";

async function getAllAlbums(): Promise<AlbumRecord[]> {
  const container = await albums();
  const { resources } = await container.items
    .query<AlbumRecord>({
      query: "SELECT * FROM c WHERE c.isDeleted = false ORDER BY c.order ASC",
    })
    .fetchAll();
  return resources;
}

export default async function AdminAlbumsPage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");

  if (!email) redirect("/login");
  const isAdmin = await isAdminGroupMember(email);
  if (!isAdmin) redirect("/");

  const albumList = await getAllAlbums();

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-white text-sm transition-colors">
          ← Admin
        </Link>
        <h1 className="text-white font-semibold">Albums</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <AlbumManager initialAlbums={albumList} />
      </main>
    </div>
  );
}
