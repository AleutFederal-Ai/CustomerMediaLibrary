import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canAccessAdmin } from "@/lib/auth/admin";
import { albums } from "@/lib/azure/cosmos";
import { AlbumRecord } from "@/types";
import UploadForm from "@/components/admin/UploadForm";

async function getActiveAlbums(): Promise<{ id: string; name: string }[]> {
  const container = await albums();
  const { resources } = await container.items
    .query<AlbumRecord>({
      query:
        "SELECT c.id, c.name FROM c WHERE c.isDeleted = false ORDER BY c['order'] ASC",
    })
    .fetchAll();
  return resources;
}

export default async function UploadPage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");

  if (!email) redirect("/login");
  const isAdmin = await canAccessAdmin(email);
  if (!isAdmin) redirect("/");

  const albumList = await getActiveAlbums();

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-white text-sm transition-colors">
          ← Admin
        </Link>
        <h1 className="text-white font-semibold">Upload Media</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {albumList.length === 0 ? (
          <div className="text-slate-400 text-sm">
            No albums exist yet.{" "}
            <Link href="/admin/albums" className="text-blue-400 hover:underline">
              Create an album first.
            </Link>
          </div>
        ) : (
          <UploadForm albums={albumList} />
        )}
      </main>
    </div>
  );
}
