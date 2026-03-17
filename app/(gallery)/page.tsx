import { headers } from "next/headers";
import Link from "next/link";
import AlbumGrid from "@/components/gallery/AlbumGrid";
import { isAdminGroupMember } from "@/lib/azure/graph";
import { AlbumListItem } from "@/types";

export default async function GalleryHomePage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email") ?? "";
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";

  async function getAlbums(): Promise<AlbumListItem[]> {
    const res = await fetch(`${proto}://${host}/api/albums`, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  }

  const [albums, isAdmin] = await Promise.all([
    getAlbums(),
    isAdminGroupMember(email),
  ]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Nav */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <h1 className="text-white font-semibold text-lg">Media Gallery</h1>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link
              href="/admin"
              className="text-slate-400 hover:text-white text-sm transition-colors"
            >
              Admin
            </Link>
          )}
          <Link
            href="/api/auth/signout"
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Sign out
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full">
        <AlbumGrid albums={albums} />
      </main>
    </div>
  );
}
