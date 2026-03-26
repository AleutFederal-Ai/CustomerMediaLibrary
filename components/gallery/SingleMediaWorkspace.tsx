"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AccountMenu from "@/components/account/AccountMenu";
import { AppShell, PageWidth } from "@/components/ui/AppFrame";
import VideoPlayer from "@/components/video-player/VideoPlayer";
import { apiFetch } from "@/lib/api-fetch";
import {
  buildGalleryAlbumPath,
  buildGalleryMediaPath,
} from "@/lib/admin-scope";

interface MediaDetail {
  id: string;
  albumId: string;
  fileName: string;
  title?: string;
  description?: string;
  fileType: "image" | "video";
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  sasUrl: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SingleMediaWorkspace({
  mediaId,
  albumId,
  tenantSlug,
}: {
  mediaId: string;
  albumId: string;
  tenantSlug: string;
}) {
  const [item, setItem] = useState<MediaDetail | null>(null);
  const [sessionEmail, setSessionEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setError("");

      const [mediaResponse, meResponse] = await Promise.all([
        apiFetch(`/api/media/${mediaId}?albumId=${albumId}`).catch(() => null),
        apiFetch("/api/me").catch(() => null),
      ]);

      if (cancelled) {
        return;
      }

      if (meResponse?.ok) {
        const meData = (await meResponse.json().catch(() => null)) as
          | { email?: string }
          | null;
        setSessionEmail(meData?.email ?? "");
      }

      if (!mediaResponse?.ok) {
        setError("This media item could not be loaded.");
        setLoading(false);
        return;
      }

      const mediaData = (await mediaResponse.json()) as MediaDetail;
      setItem(mediaData);
      setLoading(false);
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [albumId, mediaId]);

  const albumPath = buildGalleryAlbumPath(tenantSlug, albumId);
  const shareUrl = useMemo(() => {
    const sharePath = buildGalleryMediaPath(tenantSlug, mediaId);
    if (typeof window === "undefined") {
      return sharePath;
    }
    return new URL(sharePath, window.location.origin).toString();
  }, [mediaId, tenantSlug]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function handleDownload() {
    if (!item) {
      return;
    }

    const res = await apiFetch(`/api/media/download?id=${item.id}&albumId=${item.albumId}`);
    if (!res.ok) {
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = item.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell variant="gallery">
      <PageWidth className="space-y-4 py-4 sm:space-y-5 sm:py-6">
        <header className="surface-card rounded-[1.75rem] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Link
                href={albumPath}
                className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--text-muted)] hover:text-[color:var(--foreground)]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to Album
              </Link>

              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                  {item?.title ?? item?.fileName ?? "Media"}
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
                  {item?.description ??
                    "Use this direct item view when you need to focus on a single image or video without returning to the album grid."}
                </p>
              </div>
            </div>

            {sessionEmail ? (
              <AccountMenu email={sessionEmail} activeScopeLabel={item?.title ?? item?.fileName ?? "Media"} />
            ) : null}
          </div>
        </header>

        {loading ? (
          <section className="surface-card rounded-[1.5rem] p-6">
            <div className="ops-empty">
              <p className="text-lg font-semibold text-[color:var(--foreground)]">
                Loading media...
              </p>
            </div>
          </section>
        ) : error || !item ? (
          <section className="surface-card rounded-[1.5rem] p-6">
            <div className="ops-empty">
              <p className="text-lg font-semibold text-[color:var(--foreground)]">
                Unable to open media
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm text-[color:var(--text-muted)]">
                {error || "This item is unavailable."}
              </p>
            </div>
          </section>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_360px]">
            <section className="surface-card flex min-h-[60vh] items-center justify-center overflow-hidden rounded-[1.5rem] p-4 sm:p-6">
              {item.fileType === "image" ? (
                <img
                  src={item.sasUrl}
                  alt={item.title ?? item.fileName}
                  className="max-h-[75vh] max-w-full rounded-[1.25rem] object-contain"
                />
              ) : (
                <VideoPlayer
                  src={item.sasUrl}
                  mimeType={item.mimeType}
                  fileName={item.fileName}
                />
              )}
            </section>

            <aside className="surface-card rounded-[1.5rem] p-5">
              <div className="space-y-5">
                <div className="flex flex-col gap-3">
                  <button type="button" onClick={handleCopyLink} className="ops-button">
                    {copyState === "copied" ? "Link Copied" : "Copy Share Link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDownload();
                    }}
                    className="ops-button-secondary"
                  >
                    Download
                  </button>
                  <Link href={albumPath} className="ops-button-ghost text-center">
                    Open Album
                  </Link>
                </div>

                <div className="space-y-4 rounded-[1.25rem] border border-[rgba(148,163,184,0.2)] bg-slate-50/80 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      File Name
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{item.fileName}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Type
                    </p>
                    <p className="mt-1 text-sm text-slate-900">
                      {item.fileType === "image" ? "Image" : "Video"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Size
                    </p>
                    <p className="mt-1 text-sm text-slate-900">{formatBytes(item.sizeBytes)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Share URL
                    </p>
                    <p className="mt-1 break-all text-sm text-slate-700">{shareUrl}</p>
                    {copyState === "failed" ? (
                      <p className="mt-2 text-xs text-amber-700">
                        Copy failed in this browser. The URL above can still be selected manually.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Tags
                  </p>
                  {item.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[rgba(148,163,184,0.24)] bg-white px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                      No tags have been added for this item yet.
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </PageWidth>
    </AppShell>
  );
}
