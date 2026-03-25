"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import AccountMenu from "@/components/account/AccountMenu";
import MediaGrid from "@/components/gallery/MediaGrid";
import Lightbox from "@/components/lightbox/Lightbox";
import UploadForm, { UploadFormHandle } from "@/components/admin/UploadForm";
import { AlbumListItem, MediaListItem } from "@/types";
import { apiFetch } from "@/lib/api-fetch";
import { buildGalleryWorkspacePath } from "@/lib/admin-scope";
import { AppShell, PageWidth } from "@/components/ui/AppFrame";

interface MediaDetail {
  id: string;
  fileName: string;
  fileType: "image" | "video";
  mimeType: string;
  sasUrl: string;
  albumId: string;
  sizeBytes: number;
}

interface Props {
  albumId: string;
  tenantSlug?: string;
}

function hasFilePayload(transfer: DataTransfer | null | undefined): boolean {
  if (!transfer) {
    return false;
  }

  return Array.from(transfer.types ?? []).includes("Files");
}

export default function AlbumWorkspacePage({ albumId, tenantSlug }: Props) {
  const uploadFormRef = useRef<UploadFormHandle>(null);
  const dragDepthRef = useRef(0);

  const [items, setItems] = useState<MediaListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "image" | "video">("");
  const [lightboxItem, setLightboxItem] = useState<MediaDetail | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [canContribute, setCanContribute] = useState(false);
  const [sessionEmail, setSessionEmail] = useState("");
  const [albumName, setAlbumName] = useState("Album");
  const [albumDescription, setAlbumDescription] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [pageDropActive, setPageDropActive] = useState(false);
  const [pendingDroppedFiles, setPendingDroppedFiles] = useState<File[]>([]);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const albumWorkspacePath = buildGalleryWorkspacePath(tenantSlug);

  useEffect(() => {
    let cancelled = false;

    async function loadPageContext() {
      const [meResponse, albumsResponse] = await Promise.all([
        apiFetch("/api/me").catch(() => null),
        apiFetch("/api/albums").catch(() => null),
      ]);

      if (cancelled) {
        return;
      }

      if (meResponse?.ok) {
        const data = (await meResponse.json().catch(() => null)) as
          | { email?: string; canContribute?: boolean }
          | null;

        if (data?.email) {
          setSessionEmail(data.email);
        }

        if (data?.canContribute) {
          setCanContribute(true);
        }
      }

      if (albumsResponse?.ok) {
        const data = (await albumsResponse.json().catch(() => [])) as
          | AlbumListItem[]
          | null;
        const currentAlbum = data?.find((album) => album.id === albumId);

        if (currentAlbum) {
          setAlbumName(currentAlbum.name);
          setAlbumDescription(currentAlbum.description ?? "");
        }
      }
    }

    void loadPageContext();

    return () => {
      cancelled = true;
    };
  }, [albumId]);

  const fetchItems = useCallback(
    async (reset = false) => {
      if (reset) {
        setCursor(null);
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          albumId,
          ...(deferredSearchQuery && { q: deferredSearchQuery }),
          ...(typeFilter && { type: typeFilter }),
          ...(cursor && !reset && { cursor }),
        });

        const res = await apiFetch(`/api/search?${params.toString()}`);
        if (!res.ok) {
          return;
        }

        const data = (await res.json()) as {
          items: MediaListItem[];
          continuationToken?: string | null;
        };

        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        setCursor(data.continuationToken ?? null);
      } finally {
        setLoading(false);
      }
    },
    [albumId, deferredSearchQuery, typeFilter, cursor]
  );

  useEffect(() => {
    void fetchItems(true);
    // fetchItems depends on cursor for incremental paging, but reset loads
    // should only react to album and filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId, deferredSearchQuery, typeFilter]);

  async function loadLightboxAtIndex(index: number) {
    const selectedItem = items[index];
    if (!selectedItem) {
      return;
    }

    setLightboxIndex(index);

    const res = await apiFetch(
      `/api/media/${selectedItem.id}?albumId=${selectedItem.albumId}`
    );
    if (!res.ok) {
      return;
    }

    const data = (await res.json()) as MediaDetail;
    setLightboxItem(data);
  }

  async function openLightbox(item: MediaListItem) {
    const index = items.findIndex((currentItem) => currentItem.id === item.id);
    if (index < 0) {
      return;
    }

    await loadLightboxAtIndex(index);
  }

  async function navigateLightbox(direction: 1 | -1) {
    const nextIndex = lightboxIndex + direction;
    if (nextIndex < 0 || nextIndex >= items.length) {
      return;
    }

    await loadLightboxAtIndex(nextIndex);
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
    if (!confirm(`Delete "${item.fileName}"? This cannot be undone.`)) {
      return;
    }

    const res = await apiFetch(`/api/media/${item.id}?albumId=${item.albumId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      alert("Delete failed. Please try again.");
      return;
    }

    setItems((prev) => prev.filter((currentItem) => currentItem.id !== item.id));
  }

  const queueDroppedFiles = useEffectEvent((files: File[]) => {
    if (!canContribute || files.length === 0) {
      return;
    }

    setShowUploadPanel(true);
    setPendingDroppedFiles(files);
  });

  useEffect(() => {
    if (!canContribute) {
      return;
    }

    function handleWindowDragEnter(event: DragEvent) {
      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current += 1;
      setPageDropActive(true);
    }

    function handleWindowDragOver(event: DragEvent) {
      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      setPageDropActive(true);
    }

    function handleWindowDragLeave(event: DragEvent) {
      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setPageDropActive(false);
      }
    }

    function handleWindowDrop(event: DragEvent) {
      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = 0;
      setPageDropActive(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) {
        queueDroppedFiles(files);
      }
    }

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [canContribute]);

  useEffect(() => {
    if (
      pendingDroppedFiles.length === 0 ||
      !showUploadPanel ||
      !uploadFormRef.current
    ) {
      return;
    }

    uploadFormRef.current.queueFiles(pendingDroppedFiles);
    setPendingDroppedFiles([]);
    document
      .getElementById("album-upload")
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [pendingDroppedFiles, showUploadPanel]);

  const filterLabel =
    typeFilter === "image"
      ? "Images"
      : typeFilter === "video"
        ? "Videos"
        : "All media";

  return (
    <AppShell variant="gallery">
      <PageWidth className="space-y-4 py-4 sm:space-y-5 sm:py-6">
        <header className="surface-card rounded-[1.75rem] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Link
                href={albumWorkspacePath}
                className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--text-muted)] hover:text-[color:var(--foreground)]"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                All Albums
              </Link>

              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                  {albumName}
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
                  {albumDescription ||
                    "Click an item to open it full screen. Use filters or add media only when you need them."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="chip">
                  Loaded
                  <strong>{items.length}</strong>
                </span>
                <span className="chip">
                  View
                  <strong>{filterLabel}</strong>
                </span>
                {deferredSearchQuery ? (
                  <span className="chip">
                    Search
                    <strong>{deferredSearchQuery}</strong>
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px] sm:items-end">
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowFilters((current) => !current)}
                  className="ops-button-secondary"
                >
                  {showFilters ? "Hide Filters" : "Filters"}
                </button>
                {canContribute ? (
                  <button
                    type="button"
                    onClick={() => setShowUploadPanel((current) => !current)}
                    className="ops-button"
                  >
                    {showUploadPanel ? "Hide Add Media" : "Add Media"}
                  </button>
                ) : null}
              </div>

              {bulkDownloading ? (
                <span className="chip chip-accent">Preparing download...</span>
              ) : null}

              {sessionEmail ? (
                <AccountMenu email={sessionEmail} activeScopeLabel={albumName} />
              ) : null}
            </div>
          </div>
        </header>

        {showFilters ? (
          <section className="surface-card rounded-[1.5rem] p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_220px] xl:grid-cols-[minmax(0,2.4fr)_220px_220px]">
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
                  Search files or tags
                </label>
                <input
                  type="search"
                  placeholder="Search files or tags..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="ops-input"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
                  Media type
                </label>
                <select
                  value={typeFilter}
                  onChange={(event) =>
                    setTypeFilter(event.target.value as "" | "image" | "video")
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
        ) : null}

        {canContribute && showUploadPanel ? (
          <section
            id="album-upload"
            className="surface-card rounded-[1.5rem] p-4 sm:p-5"
          >
            <div className="mb-5 space-y-2">
              <p className="text-sm font-medium text-[color:var(--text-muted)]">
                Add media
              </p>
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
                Upload files into this album
              </h2>
              <p className="text-sm leading-6 text-[color:var(--text-muted)]">
                Drag files onto the page or browse from your computer. New files
                are queued here and uploaded one at a time.
              </p>
            </div>

            <UploadForm
              ref={uploadFormRef}
              albums={[{ id: albumId, name: albumName }]}
              initialAlbumId={albumId}
              lockAlbum={true}
              albumLabel={albumName}
              onSuccess={() => {
                void fetchItems(true);
              }}
            />
          </section>
        ) : null}

        <section className="surface-card rounded-[1.5rem] p-4 sm:p-5">
          {loading && items.length === 0 ? (
            <div className="ops-empty">
              <p className="text-lg font-semibold text-[color:var(--foreground)]">
                Loading media...
              </p>
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
                    onClick={() => {
                      void fetchItems(false);
                    }}
                    className="ops-button-secondary"
                  >
                    Load More Files
                  </button>
                </div>
              ) : null}

              {loading && items.length > 0 ? (
                <div className="mt-5 text-center text-sm text-[color:var(--text-muted)]">
                  Loading additional files...
                </div>
              ) : null}
            </>
          )}
        </section>
      </PageWidth>

      {pageDropActive ? (
        <div className="fixed inset-0 z-40 bg-slate-950/10 backdrop-blur-[2px]">
          <div className="flex h-full items-center justify-center p-6">
            <div className="rounded-[2rem] border-2 border-dashed border-slate-900 bg-white px-8 py-10 text-center shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Drop files to upload
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                {albumName}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Release to add the files to this album&apos;s upload queue.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {lightboxItem ? (
        <Lightbox
          item={lightboxItem}
          items={items}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxItem(null)}
          onPrev={() => {
            void navigateLightbox(-1);
          }}
          onNext={() => {
            void navigateLightbox(1);
          }}
          onSelect={(index) => {
            void loadLightboxAtIndex(index);
          }}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < items.length - 1}
        />
      ) : null}
    </AppShell>
  );
}
