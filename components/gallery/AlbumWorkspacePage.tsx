"use client";

import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import MediaGrid from "@/components/gallery/MediaGrid";
import Lightbox from "@/components/lightbox/Lightbox";
import UploadForm, { UploadFormHandle } from "@/components/admin/UploadForm";
import { AccountTenantOption } from "@/components/account/AccountMenu";
import { AlbumListItem, MediaListItem } from "@/types";
import { apiFetch } from "@/lib/api-fetch";
import { buildGalleryAlbumPath, buildGalleryWorkspacePath } from "@/lib/admin-scope";
import { AppShell, PageWidth } from "@/components/ui/AppFrame";
import PlatformHeader from "@/components/ui/PlatformHeader";

interface MediaDetail {
  id: string;
  fileName: string;
  title?: string;
  description?: string;
  fileType: "image" | "video" | "link";
  mimeType: string;
  sasUrl: string;
  albumId: string;
  sizeBytes: number;
  tags: string[];
  externalUrl?: string;
}

interface Props {
  albumId: string;
  initialAlbumName: string;
  tenantName: string;
  tenantId?: string;
  tenantSlug?: string;
  sessionEmail: string;
  tenantOptions?: AccountTenantOption[];
  canSwitchTenant?: boolean;
  adminHref?: string;
}

function hasFilePayload(transfer: DataTransfer | null | undefined): boolean {
  if (!transfer) {
    return false;
  }

  return Array.from(transfer.types ?? []).includes("Files");
}

export default function AlbumWorkspacePage({
  albumId,
  initialAlbumName,
  tenantName,
  tenantId,
  tenantSlug,
  sessionEmail,
  tenantOptions = [],
  canSwitchTenant = false,
  adminHref,
}: Props) {
  const uploadFormRef = useRef<UploadFormHandle>(null);
  const dragDepthRef = useRef(0);
  // Cancels the /api/media/:id fetch of the previously-open lightbox item
  // when the user navigates quickly with the arrow keys or thumbnails.
  const lightboxAbortRef = useRef<AbortController | null>(null);
  // Monotonic counter used as a belt-and-suspenders guard so a stale
  // response that slipped past AbortController can't overwrite the
  // currently-displayed item.
  const lightboxLoadSeqRef = useRef(0);

  const [items, setItems] = useState<MediaListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "image" | "video" | "link">("");
  const [lightboxItem, setLightboxItem] = useState<MediaDetail | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [deletingSelection, setDeletingSelection] = useState(false);
  const [updatingCover, setUpdatingCover] = useState(false);
  const [canContribute, setCanContribute] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [albumName, setAlbumName] = useState(initialAlbumName);
  const [albumDescription, setAlbumDescription] = useState("");
  const [albumSlug, setAlbumSlug] = useState<string | undefined>();
  const [albumCoverMediaId, setAlbumCoverMediaId] = useState<string | undefined>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [showAddUrlPanel, setShowAddUrlPanel] = useState(false);
  const [addUrlValue, setAddUrlValue] = useState("");
  const [addUrlTitle, setAddUrlTitle] = useState("");
  const [addUrlDescription, setAddUrlDescription] = useState("");
  const [addUrlSubmitting, setAddUrlSubmitting] = useState(false);
  const [addUrlError, setAddUrlError] = useState("");
  const [pageDropActive, setPageDropActive] = useState(false);
  const [pendingDroppedFiles, setPendingDroppedFiles] = useState<File[]>([]);
  const [shareCopied, setShareCopied] = useState(false);

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
          | { email?: string; canContribute?: boolean; isAdmin?: boolean }
          | null;

        if (data?.isAdmin) {
          setIsAdmin(true);
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
          setAlbumSlug(currentAlbum.slug);
          setAlbumDescription(currentAlbum.description ?? "");
          setAlbumCoverMediaId(currentAlbum.coverMediaId);
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

    // Cancel any still-pending fetch from the previous navigation so the
    // browser drops its in-flight HTTP request immediately and we don't
    // race on state updates.
    lightboxAbortRef.current?.abort();
    const controller = new AbortController();
    lightboxAbortRef.current = controller;
    const seq = ++lightboxLoadSeqRef.current;

    setLightboxIndex(index);

    // Provisional render: swap immediately to the thumbnail we already
    // have in memory so the user sees the correct picture (low-res) while
    // the SAS URL round-trip is in flight. The full-res image replaces it
    // as soon as the response returns.
    setLightboxItem({
      id: selectedItem.id,
      albumId: selectedItem.albumId,
      fileName: selectedItem.fileName,
      title: selectedItem.title,
      description: selectedItem.description,
      fileType: selectedItem.fileType,
      mimeType: selectedItem.mimeType,
      sizeBytes: selectedItem.sizeBytes,
      sasUrl: selectedItem.thumbnailUrl,
      tags: selectedItem.tags,
      externalUrl: selectedItem.externalUrl,
    });

    try {
      const res = await apiFetch(
        `/api/media/${selectedItem.id}?albumId=${selectedItem.albumId}`,
        { signal: controller.signal }
      );
      if (!res.ok || seq !== lightboxLoadSeqRef.current) {
        return;
      }

      const data = (await res.json()) as MediaDetail;
      if (seq !== lightboxLoadSeqRef.current) {
        // A newer navigation won the race — drop this stale response.
        return;
      }
      setLightboxItem(data);
    } catch (err) {
      // AbortError is expected when the user navigates again before the
      // previous request finished. Anything else is unexpected but we
      // don't want to crash the lightbox.
      if ((err as Error | null)?.name !== "AbortError") {
        throw err;
      }
    }
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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });

    if (lightboxItem?.id === item.id) {
      setLightboxItem(null);
    }

    if (albumCoverMediaId === item.id) {
      setAlbumCoverMediaId(undefined);
    }
  }

  async function handleBulkDelete(ids: string[]) {
    if (ids.length === 0) {
      return;
    }

    const selectedItems = items.filter((item) => ids.includes(item.id));
    const label =
      selectedItems.length === 1
        ? `"${selectedItems[0]?.fileName ?? "selected file"}"`
        : `${selectedItems.length} selected files`;

    if (!confirm(`Delete ${label}? This cannot be undone.`)) {
      return;
    }

    setDeletingSelection(true);

    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const targetItem = selectedItems.find((item) => item.id === id);
          if (!targetItem) {
            return;
          }

          const res = await apiFetch(`/api/media/${id}?albumId=${targetItem.albumId}`, {
            method: "DELETE",
          });

          if (!res.ok) {
            throw new Error(targetItem.fileName);
          }
        })
      );

      const failedCount = results.filter((result) => result.status === "rejected").length;
      if (failedCount > 0) {
        alert(
          failedCount === ids.length
            ? "Delete failed. Please try again."
            : `${failedCount} file${failedCount === 1 ? "" : "s"} could not be deleted.`
        );
      }

      const deletedIds = ids.filter((_, index) => results[index]?.status === "fulfilled");
      if (deletedIds.length > 0) {
        setItems((prev) => prev.filter((item) => !deletedIds.includes(item.id)));
        setSelectedIds(new Set());

        if (lightboxItem && deletedIds.includes(lightboxItem.id)) {
          setLightboxItem(null);
        }

        if (albumCoverMediaId && deletedIds.includes(albumCoverMediaId)) {
          setAlbumCoverMediaId(undefined);
        }
      }
    } finally {
      setDeletingSelection(false);
    }
  }

  async function handleMakeAlbumCover(mediaId: string) {
    setUpdatingCover(true);

    try {
      const res = await apiFetch(`/api/admin/albums?id=${albumId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverMediaId: mediaId }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(data?.error ?? "Unable to update the album cover.");
        return;
      }

      setAlbumCoverMediaId(mediaId);
    } finally {
      setUpdatingCover(false);
    }
  }

  async function handleMetadataSave(nextMetadata: {
    title: string;
    description: string;
    tags: string[];
  }) {
    if (!lightboxItem) {
      return;
    }

    const res = await apiFetch(`/api/media/${lightboxItem.id}?albumId=${lightboxItem.albumId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextMetadata),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Unable to save media details.");
    }

    const updated = (await res.json()) as Pick<
      MediaDetail,
      "title" | "description" | "tags"
    >;

    setLightboxItem((current) =>
      current
        ? {
            ...current,
            title: updated.title,
            description: updated.description,
            tags: updated.tags,
          }
        : current
    );

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === lightboxItem.id
          ? {
              ...item,
              title: updated.title,
              description: updated.description,
              tags: updated.tags,
            }
          : item
      )
    );
  }

  async function handleAddUrl() {
    // Strip whitespace and the `<` / `>` wrappers Outlook sometimes adds
    // when users copy a hyperlink out of an email.
    const url = addUrlValue.trim().replace(/^<+/, "").replace(/>+$/, "").trim();
    if (!url) return;

    setAddUrlSubmitting(true);
    setAddUrlError("");

    try {
      const res = await apiFetch("/api/admin/media-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          albumId,
          url,
          title: addUrlTitle.trim() || undefined,
          description: addUrlDescription.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        const fallback = `Failed to add URL (HTTP ${res.status}). Only YouTube, Vimeo, Dailymotion, and Rumble links over HTTPS are supported.`;
        setAddUrlError(data?.error ?? fallback);
        return;
      }

      const newItem = (await res.json()) as MediaListItem;
      setItems((prev) => [newItem, ...prev]);
      setAddUrlValue("");
      setAddUrlTitle("");
      setAddUrlDescription("");
      setShowAddUrlPanel(false);
    } catch {
      setAddUrlError("Network error. Please try again.");
    } finally {
      setAddUrlSubmitting(false);
    }
  }

  const queueDroppedFiles = useEffectEvent((files: File[]) => {
    if (!canContribute || files.length === 0) {
      return;
    }

    setShowUploadPanel(true);
    setPendingDroppedFiles(files);
  });

  // Reorder is only sound when we're looking at the unfiltered, unsorted
  // album. Searching or filtering would reorder within a subset, which
  // would corrupt the global order.
  const reorderEnabled =
    canContribute && !deferredSearchQuery && !typeFilter;

  async function handleReorder(fromId: string, toId: string) {
    if (!reorderEnabled) return;

    const fromIndex = items.findIndex((item) => item.id === fromId);
    const toIndex = items.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    // Optimistic reorder: move `fromId` into the slot currently occupied
    // by `toId`. This matches how users expect drag-and-drop to behave —
    // the dropped item takes the target's position and everything between
    // shifts one slot.
    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Rebuild a contiguous 0..n-1 `order` for the affected span so the
    // server state stays in sync with what the user sees.
    const lo = Math.min(fromIndex, toIndex);
    const hi = Math.max(fromIndex, toIndex);
    const updates: Array<{ id: string; order: number }> = [];
    for (let i = lo; i <= hi; i += 1) {
      updates.push({ id: reordered[i].id, order: i });
    }

    const patchedItems = reordered.map((item, index) => {
      if (index >= lo && index <= hi) {
        return { ...item, order: index };
      }
      return item;
    });
    setItems(patchedItems);

    try {
      await Promise.all(
        updates.map((update) =>
          apiFetch(`/api/media/${update.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: update.order }),
          })
        )
      );
    } catch {
      // On failure, refetch the album so the client shows server state.
      void fetchItems(true);
    }
  }

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
  }, [pendingDroppedFiles, showUploadPanel]);

  useEffect(() => {
    if (!showUploadPanel) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showUploadPanel]);

  const filterLabel =
    typeFilter === "image"
      ? "Images"
      : typeFilter === "video"
        ? "Videos"
        : typeFilter === "link"
          ? "Links"
          : "All media";

  return (
    <AppShell variant="gallery">
      <PlatformHeader
        homeHref={buildGalleryWorkspacePath(tenantSlug)}
        tenantName={tenantName}
        pageLabel={albumName}
        email={sessionEmail}
        activeScopeLabel={albumName}
        activeTenantId={tenantId}
        tenantOptions={tenantOptions}
        canSwitchTenant={canSwitchTenant}
        adminHref={adminHref}
      />

      <PageWidth className="space-y-4 py-4 sm:space-y-5 sm:py-6">
        <header className="surface-card rounded-[1.5rem] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
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
                <Link
                  href={albumWorkspacePath}
                  className="ops-button-ghost text-center"
                >
                  All Albums
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    const albumIdentifier = albumSlug || albumId;
                    const path = buildGalleryAlbumPath(tenantSlug, albumIdentifier);
                    const fullUrl = `${window.location.origin}${path}`;
                    navigator.clipboard.writeText(fullUrl).then(() => {
                      setShareCopied(true);
                      setTimeout(() => setShareCopied(false), 2000);
                    });
                  }}
                  className="ops-button-secondary"
                >
                  {shareCopied ? "Link Copied!" : "Share"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilters((current) => !current)}
                  className="ops-button-secondary"
                >
                  {showFilters ? "Hide Filters" : "Filters"}
                </button>
                {canContribute ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowAddUrlPanel((current) => !current)}
                      className="ops-button-secondary"
                    >
                      {showAddUrlPanel ? "Hide Add URL" : "Add URL"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowUploadPanel((current) => !current)}
                      className="ops-button"
                    >
                      {showUploadPanel ? "Hide Add Media" : "Add Media"}
                    </button>
                  </>
                ) : null}
              </div>

              {bulkDownloading ? (
                <span className="chip chip-accent">Preparing download...</span>
              ) : null}
            </div>
          </div>
        </header>

        {lightboxItem ? (
          <Lightbox
            item={lightboxItem}
            items={items}
            tenantSlug={tenantSlug}
            currentIndex={lightboxIndex}
            canEditDetails={isAdmin}
            canSetAlbumCover={isAdmin && lightboxItem.fileType === "image"}
            isAlbumCover={lightboxItem.id === albumCoverMediaId}
            makingAlbumCover={updatingCover}
            onSaveMetadata={handleMetadataSave}
            onMakeAlbumCover={() => {
              void handleMakeAlbumCover(lightboxItem.id);
            }}
            onClose={() => {
              lightboxAbortRef.current?.abort();
              lightboxAbortRef.current = null;
              setLightboxItem(null);
            }}
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
        ) : (
          <>
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
                        setTypeFilter(event.target.value as "" | "image" | "video" | "link")
                      }
                      aria-label="Filter by type"
                      className="ops-select"
                    >
                      <option value="">All types</option>
                      <option value="image">Images</option>
                      <option value="video">Videos</option>
                      <option value="link">External Links</option>
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
                    selectedIds={selectedIds}
                    onSelectedChange={setSelectedIds}
                    onItemClick={openLightbox}
                    onBulkDownload={handleBulkDownload}
                    onBulkDelete={canContribute ? handleBulkDelete : undefined}
                    onMakeAlbumCover={isAdmin ? handleMakeAlbumCover : undefined}
                    albumCoverMediaId={albumCoverMediaId}
                    deletingSelection={deletingSelection}
                    updatingCover={updatingCover}
                    canContribute={canContribute}
                    onDelete={handleDelete}
                    onReorder={reorderEnabled ? handleReorder : undefined}
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
          </>
        )}
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

      {canContribute && showAddUrlPanel ? (
        <div className="fixed inset-0 z-50 bg-slate-950/45 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full w-full max-w-xl items-center justify-center">
            <div className="surface-card max-h-full w-full overflow-y-auto rounded-[1.5rem] p-5 shadow-[0_30px_80px_rgba(15,23,42,0.22)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[color:var(--text-muted)]">
                    Add external video URL
                  </p>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
                    {albumName}
                  </h2>
                  <p className="text-sm text-[color:var(--text-muted)]">
                    Add a YouTube, Vimeo, Dailymotion, or Rumble video link to this album.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddUrlPanel(false);
                    setAddUrlError("");
                  }}
                  className="ops-button-ghost !w-auto"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
                    Video URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={addUrlValue}
                    onChange={(e) => setAddUrlValue(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="ops-input"
                    disabled={addUrlSubmitting}
                  />
                  <p className="mt-1.5 text-xs text-[color:var(--text-muted)]">
                    Supported: YouTube, Vimeo, Dailymotion, Rumble (HTTPS only)
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
                    Title <span className="text-[color:var(--text-muted)]">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={addUrlTitle}
                    onChange={(e) => setAddUrlTitle(e.target.value)}
                    placeholder="My Video Title"
                    className="ops-input"
                    disabled={addUrlSubmitting}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
                    Description <span className="text-[color:var(--text-muted)]">(optional)</span>
                  </label>
                  <textarea
                    value={addUrlDescription}
                    onChange={(e) => setAddUrlDescription(e.target.value)}
                    rows={3}
                    placeholder="Brief description of the video..."
                    className="ops-input min-h-[80px] resize-y"
                    disabled={addUrlSubmitting}
                  />
                </div>

                {addUrlError ? (
                  <p className="text-sm text-red-600">{addUrlError}</p>
                ) : null}

                <button
                  type="button"
                  onClick={() => { void handleAddUrl(); }}
                  disabled={addUrlSubmitting || !addUrlValue.trim()}
                  className="ops-button w-full disabled:opacity-50"
                >
                  {addUrlSubmitting ? "Adding..." : "Add URL to Album"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {canContribute && showUploadPanel ? (
        <div className="fixed inset-0 z-50 bg-slate-950/45 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full w-full max-w-4xl items-center justify-center">
            <div className="surface-card max-h-full w-full overflow-y-auto rounded-[1.5rem] p-5 shadow-[0_30px_80px_rgba(15,23,42,0.22)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[color:var(--text-muted)]">
                    Upload media
                  </p>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
                    {albumName}
                  </h2>
                  <p className="text-sm text-[color:var(--text-muted)]">
                    Add files to this album, then return to the gallery when the upload finishes.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowUploadPanel(false)}
                  className="ops-button-ghost !w-auto"
                >
                  Close
                </button>
              </div>

              <div className="mt-5">
                <UploadForm
                  ref={uploadFormRef}
                  albums={[{ id: albumId, name: albumName }]}
                  initialAlbumId={albumId}
                  lockAlbum={true}
                  albumLabel={albumName}
                  variant="compact"
                  onSuccess={() => {
                    void fetchItems(true);
                    setShowUploadPanel(false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
