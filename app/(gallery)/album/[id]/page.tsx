"use client";

import { useState, useEffect, useCallback, useDeferredValue } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MediaGrid from "@/components/gallery/MediaGrid";
import Lightbox from "@/components/lightbox/Lightbox";
import UploadForm from "@/components/admin/UploadForm";
import { MediaListItem } from "@/types";
import { apiFetch } from "@/lib/api-fetch";
import { AppShell, HeroSection, PageWidth, TopBar } from "@/components/ui/AppFrame";

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

  const [items, setItems] = useState<MediaListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "image" | "video">("");
  const [lightboxItem, setLightboxItem] = useState<MediaDetail | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [canContribute, setCanContribute] = useState(false);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    apiFetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.canContribute) setCanContribute(true);
      })
      .catch(() => {});
  }, []);

  const fetchItems = useCallback(
    async (reset = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          albumId,
          ...(deferredSearchQuery && { q: deferredSearchQuery }),
          ...(typeFilter && { type: typeFilter }),
          ...(cursor && !reset && { cursor }),
        });

        const res = await apiFetch(`/api/search?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        setCursor(data.continuationToken);
      } finally {
        setLoading(false);
      }
    },
    [albumId, deferredSearchQuery, typeFilter, cursor]
  );

  useEffect(() => {
    fetchItems(true);
    // fetchItems depends on cursor for incremental paging, but reset loads
    // should only react to album and filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId, deferredSearchQuery, typeFilter]);

  async function openLightbox(item: MediaListItem) {
    const idx = items.findIndex((i) => i.id === item.id);
    setLightboxIndex(idx);

    const res = await apiFetch(`/api/media/${item.id}?albumId=${item.albumId}`);
    if (!res.ok) return;
    const data = await res.json();
    setLightboxItem(data);
  }

  async function navigateLightbox(direction: 1 | -1) {
    const newIdx = lightboxIndex + direction;
    if (newIdx < 0 || newIdx >= items.length) return;
    setLightboxIndex(newIdx);
    const item = items[newIdx];
    const res = await apiFetch(`/api/media/${item.id}?albumId=${item.albumId}`);
    if (!res.ok) return;
    const data = await res.json();
    setLightboxItem(data);
  }

  async function handleBulkDownload(ids: string[]) {
    setBulkDownloading(true);
    try {
      const res = await apiFetch("/api/download/bulk", {
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

  async function handleDelete(item: MediaListItem) {
    if (!confirm(`Delete "${item.fileName}"? This cannot be undone.`)) return;

    const res = await apiFetch(`/api/media/${item.id}?albumId=${item.albumId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      alert("Delete failed. Please try again.");
      return;
    }

    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  return (
    <AppShell>
      <TopBar>
        <div className="flex items-center gap-3">
          <Link href="/" className="shell-nav-link ops-focus-ring">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            All Albums
          </Link>
          <div>
            <p className="hero-kicker">Album Workspace</p>
            <p className="text-sm text-white/80">Operational review and download surface</p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          {canContribute ? (
            <a href="#album-upload" className="ops-button">
              Upload Media
            </a>
          ) : null}
        </div>
      </TopBar>

      <PageWidth className="space-y-6 py-8 sm:space-y-8 sm:py-10">
        <HeroSection
          eyebrow="Managed Album Surface"
          title="Mission imagery and video workspace"
          description="Search by filename or tags, filter content types, queue bulk downloads, and open individual media in the secure viewer."
          meta={
            <>
              <span className="chip chip-accent">
                <strong>{items.length}</strong>
                Loaded Assets
              </span>
              <span className="chip">
                View Mode
                <strong>{typeFilter || "All media"}</strong>
              </span>
              <span className="chip">
                Search
                <strong>{deferredSearchQuery || "None"}</strong>
              </span>
            </>
          }
        />

        {canContribute ? (
          <section id="album-upload" className="surface-card rounded-[1.5rem] p-5 sm:p-6">
            <div className="mb-5 space-y-2">
              <p className="hero-kicker">Album Upload Queue</p>
              <h2 className="section-title">Add multiple files into this album</h2>
              <p className="section-copy">
                Drag media directly onto this panel or browse up to 20 files at
                a time. The queue uploads items one by one and refreshes the
                album grid when the batch completes.
              </p>
            </div>

            <UploadForm
              albums={[{ id: albumId, name: "Current album" }]}
              initialAlbumId={albumId}
              lockAlbum={true}
              albumLabel="Current album"
              onSuccess={() => {
                void fetchItems(true);
              }}
            />
          </section>
        ) : null}

        <section className="surface-card rounded-[1.5rem] p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="hero-kicker">Filter Controls</p>
              <h2 className="section-title">Refine the media set</h2>
              <p className="section-copy">
                Narrow this album by filename, tags, or asset type before opening or exporting.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {bulkDownloading ? <span className="chip chip-accent">Preparing archive...</span> : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,2fr)_220px] xl:grid-cols-[minmax(0,2.4fr)_220px_220px]">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/82">
                Search files or tags
              </label>
              <input
                type="search"
                placeholder="Search files or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ops-input"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/82">
                Media type
              </label>
              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value as "" | "image" | "video")
                }
                aria-label="Filter by type"
                className="ops-select"
              >
                <option value="">All types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setTypeFilter("");
                }}
                className="ops-button-secondary w-full"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </section>

        <section className="surface-card rounded-[1.5rem] p-5 sm:p-6">
          {loading && items.length === 0 ? (
            <div className="ops-empty">
              <p className="text-lg font-semibold text-white">Loading media...</p>
            </div>
          ) : (
            <>
              <MediaGrid
                items={items}
                onItemClick={openLightbox}
                onBulkDownload={handleBulkDownload}
                canContribute={canContribute}
                onDelete={handleDelete}
              />

              {cursor && !loading ? (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => fetchItems(false)}
                    className="ops-button-secondary"
                  >
                    Load More Assets
                  </button>
                </div>
              ) : null}

              {loading && items.length > 0 ? (
                <div className="mt-5 text-center text-sm text-[var(--text-muted)]">
                  Loading additional assets...
                </div>
              ) : null}
            </>
          )}
        </section>
      </PageWidth>

      {lightboxItem ? (
        <Lightbox
          item={lightboxItem}
          onClose={() => setLightboxItem(null)}
          onPrev={() => navigateLightbox(-1)}
          onNext={() => navigateLightbox(1)}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < items.length - 1}
        />
      ) : null}
    </AppShell>
  );
}
