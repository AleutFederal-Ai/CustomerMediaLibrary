"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import CuiBanner from "@/components/ui/CuiBanner";
import MediaGrid from "@/components/gallery/MediaGrid";
import Lightbox from "@/components/lightbox/Lightbox";
import { MediaListItem } from "@/types";

interface MediaDetail {
  id: string;
  fileName: string;
  fileType: "image" | "video";
  mimeType: string;
  sasUrl: string;
  albumId: string;
  sizeBytes: number;
}

export default function AlbumPage() {
  const { id: albumId } = useParams<{ id: string }>();
  const router = useRouter();

  const [items, setItems] = useState<MediaListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "image" | "video">("");
  const [lightboxItem, setLightboxItem] = useState<MediaDetail | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const fetchItems = useCallback(
    async (reset = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          albumId,
          ...(searchQuery && { q: searchQuery }),
          ...(typeFilter && { type: typeFilter }),
          ...(cursor && !reset && { cursor }),
        });

        const res = await fetch(`/api/search?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        setCursor(data.continuationToken);
      } finally {
        setLoading(false);
      }
    },
    [albumId, searchQuery, typeFilter, cursor]
  );

  useEffect(() => {
    fetchItems(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId, searchQuery, typeFilter]);

  async function openLightbox(item: MediaListItem) {
    const idx = items.findIndex((i) => i.id === item.id);
    setLightboxIndex(idx);

    // Fetch full SAS URL for full-res / video
    const res = await fetch(
      `/api/media/${item.id}?albumId=${item.albumId}`
    );
    if (!res.ok) return;
    const data = await res.json();
    setLightboxItem(data);
  }

  async function navigateLightbox(direction: 1 | -1) {
    const newIdx = lightboxIndex + direction;
    if (newIdx < 0 || newIdx >= items.length) return;
    setLightboxIndex(newIdx);
    const item = items[newIdx];
    const res = await fetch(`/api/media/${item.id}?albumId=${item.albumId}`);
    if (!res.ok) return;
    const data = await res.json();
    setLightboxItem(data);
  }

  async function handleBulkDownload(ids: string[]) {
    setBulkDownloading(true);
    try {
      const res = await fetch("/api/download/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaIds: ids, albumId }),
      });

      if (!res.ok) {
        alert("Bulk download failed.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `media-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBulkDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <CuiBanner />

      {/* Nav */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-4">
        <Link
          href="/"
          className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Albums
        </Link>
        <h1 className="text-white font-semibold flex-1 truncate">Album</h1>
      </header>

      {/* Filters */}
      <div className="bg-slate-800/50 border-b border-slate-700 px-6 py-3 flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search files or tags…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "" | "image" | "video")}
          aria-label="Filter by type"
          className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        {bulkDownloading && (
          <span className="text-slate-400 text-sm self-center">Preparing download…</span>
        )}
      </div>

      <main className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full">
        {loading && items.length === 0 ? (
          <div className="text-center py-24 text-slate-500">Loading…</div>
        ) : (
          <>
            <MediaGrid
              items={items}
              onItemClick={openLightbox}
              onBulkDownload={handleBulkDownload}
            />

            {cursor && !loading && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => fetchItems(false)}
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition-colors"
                >
                  Load more
                </button>
              </div>
            )}

            {loading && items.length > 0 && (
              <div className="mt-4 text-center text-slate-500 text-sm">Loading…</div>
            )}
          </>
        )}
      </main>

      {lightboxItem && (
        <Lightbox
          item={lightboxItem}
          onClose={() => setLightboxItem(null)}
          onPrev={() => navigateLightbox(-1)}
          onNext={() => navigateLightbox(1)}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < items.length - 1}
        />
      )}
    </div>
  );
}
