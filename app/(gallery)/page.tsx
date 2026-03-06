import { headers } from "next/headers";
import Link from "next/link";
import CuiBanner from "@/components/ui/CuiBanner";
import AlbumGrid from "@/components/gallery/AlbumGrid";
import { AlbumListItem } from "@/types";

async function getAlbums(): Promise<AlbumListItem[]> {
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";

  const res = await fetch(`${proto}://${host}/api/albums`, {
    // Forward the session cookie for auth
    headers: {
      cookie: headerStore.get("cookie") ?? "",
    },
    cache: "no-store",
  });

  if (!res.ok) return [];
  return res.json();
}

export default async function GalleryHomePage() {
  const albums = await getAlbums();

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <CuiBanner />

      {/* Nav */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <h1 className="text-white font-semibold text-lg">Media Gallery</h1>
        <div className="flex items-center gap-4">
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
