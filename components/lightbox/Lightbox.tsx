"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VideoPlayer from "@/components/video-player/VideoPlayer";
import { apiFetch } from "@/lib/api-fetch";
import { buildGalleryMediaPath } from "@/lib/admin-scope";
import { MediaListItem } from "@/types";

interface MediaDetail {
  id: string;
  fileName: string;
  title?: string;
  description?: string;
  fileType: "image" | "video";
  mimeType: string;
  sasUrl: string;
  albumId: string;
  sizeBytes: number;
  tags: string[];
}

interface Props {
  item: MediaDetail;
  items: MediaListItem[];
  tenantSlug?: string;
  currentIndex: number;
  canEditDetails?: boolean;
  canSetAlbumCover?: boolean;
  isAlbumCover?: boolean;
  makingAlbumCover?: boolean;
  onSaveMetadata?: (nextMetadata: {
    title: string;
    description: string;
    tags: string[];
  }) => Promise<void>;
  onMakeAlbumCover?: () => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSelect?: (index: number) => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Lightbox({
  item,
  items,
  tenantSlug,
  currentIndex,
  canEditDetails = false,
  canSetAlbumCover = false,
  isAlbumCover = false,
  makingAlbumCover = false,
  onSaveMetadata,
  onMakeAlbumCover,
  onClose,
  onPrev,
  onNext,
  onSelect,
  hasPrev,
  hasNext,
}: Props) {
  const touchStartXRef = useRef<number | null>(null);
  const compactActionClass =
    "!w-auto px-3 py-2 text-[0.78rem] sm:px-4 sm:py-3 sm:text-sm";
  const [title, setTitle] = useState(item.title ?? item.fileName);
  const [description, setDescription] = useState(item.description ?? "");
  const [tagsText, setTagsText] = useState(item.tags.join(", "));
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [slideshowActive, setSlideshowActive] = useState(false);
  const [slideshowMessage, setSlideshowMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setTitle(item.title ?? item.fileName);
    setDescription(item.description ?? "");
    setTagsText(item.tags.join(", "));
    setSaveMessage("");
    setSaveError("");
    setCopyState("idle");
  }, [item]);

  const stopSlideshow = useCallback(() => {
    setSlideshowActive(false);
  }, []);

  const handlePrev = useCallback(() => {
    stopSlideshow();
    onPrev?.();
  }, [onPrev, stopSlideshow]);

  const handleNext = useCallback(() => {
    stopSlideshow();
    onNext?.();
  }, [onNext, stopSlideshow]);

  const handleSelectIndex = useCallback(
    (index: number) => {
      stopSlideshow();
      onSelect?.(index);
    },
    [onSelect, stopSlideshow]
  );

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && hasPrev) handlePrev();
      if (event.key === "ArrowRight" && hasNext) handleNext();
    },
    [handleNext, handlePrev, hasNext, hasPrev, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [handleKey]);

  const getNextImageIndex = useCallback(() => {
    for (let index = currentIndex + 1; index < items.length; index += 1) {
      if (items[index]?.fileType === "image") {
        return index;
      }
    }

    return null;
  }, [currentIndex, items]);

  useEffect(() => {
    if (!slideshowActive) {
      return;
    }

    if (item.fileType !== "image") {
      setSlideshowActive(false);
      setSlideshowMessage("Slideshow is available for images.");
      return;
    }

    const nextImageIndex = getNextImageIndex();
    if (nextImageIndex === null) {
      setSlideshowActive(false);
      setSlideshowMessage("Slideshow finished.");
      return;
    }

    const timer = window.setTimeout(() => {
      onSelect?.(nextImageIndex);
    }, 3500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentIndex, getNextImageIndex, item.fileType, onSelect, slideshowActive]);

  function handleSlideshowToggle() {
    if (item.fileType !== "image") {
      setSlideshowActive(false);
      setSlideshowMessage("Slideshow is available for images.");
      return;
    }

    setSlideshowMessage("");
    setSlideshowActive((current) => !current);
  }

  const handleDownload = async () => {
    const res = await apiFetch(`/api/media/download?id=${item.id}&albumId=${item.albumId}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareUrl = useMemo(() => {
    const sharePath = buildGalleryMediaPath(tenantSlug, item.id);
    if (typeof window === "undefined") {
      return sharePath;
    }
    return new URL(sharePath, window.location.origin).toString();
  }, [item.id, tenantSlug]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function handleSaveDetails() {
    if (!onSaveMetadata) {
      return;
    }

    setSaving(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const tags = tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      await onSaveMetadata({
        title: title.trim(),
        description: description.trim(),
        tags,
      });

      setTagsText(tags.join(", "));
      setSaveMessage("Media details saved.");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save media details."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="surface-card overflow-hidden rounded-[1.5rem] border border-slate-900/80 bg-[rgba(1,7,12,0.96)]"
      role="dialog"
      aria-label={item.title ?? item.fileName}
    >
      <div className="border-b border-white/10 bg-slate-950/70 px-4 py-4">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-400">
              {currentIndex + 1} of {items.length}
            </p>
            <p className="mt-1 truncate text-lg font-semibold tracking-[-0.03em] text-white">
              {item.title ?? item.fileName}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {item.fileType === "image" ? "Image" : "Video"} - {formatBytes(item.sizeBytes)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            {item.fileType === "image" ? (
              <button
                type="button"
                onClick={handleSlideshowToggle}
                className={`ops-button-secondary ${compactActionClass}`}
              >
                {slideshowActive ? "Stop Slideshow" : "Start Slideshow"}
              </button>
            ) : null}
            {canSetAlbumCover ? (
              <button
                type="button"
                onClick={onMakeAlbumCover}
                disabled={makingAlbumCover || isAlbumCover}
                className={`ops-button-secondary ${compactActionClass} disabled:opacity-50`}
              >
                {isAlbumCover
                  ? "Album Cover"
                  : makingAlbumCover
                    ? "Saving Cover..."
                    : "Make Album Cover"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleCopyLink}
              className={`ops-button-secondary ${compactActionClass}`}
            >
              {copyState === "copied" ? "Link Copied" : "Copy Share Link"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className={`ops-button ${compactActionClass}`}
            >
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`ops-button-secondary ${compactActionClass}`}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <div
        className="relative px-4 py-6 sm:px-6"
        onTouchStart={(event) => {
          touchStartXRef.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const startX = touchStartXRef.current;
          const endX = event.changedTouches[0]?.clientX ?? null;

          if (startX === null || endX === null) {
            touchStartXRef.current = null;
            return;
          }

          const delta = endX - startX;
          if (delta > 60 && hasPrev) {
            handlePrev();
          } else if (delta < -60 && hasNext) {
            handleNext();
          }
          touchStartXRef.current = null;
        }}
      >
        {hasPrev ? (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white backdrop-blur"
            aria-label="Previous"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        ) : null}

        <div className="mx-auto grid min-h-[calc(100vh-19rem)] w-full max-w-7xl gap-4 xl:grid-cols-[minmax(0,1.8fr)_360px]">
          <div className="flex min-h-[52vh] items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/8 bg-black/25 p-3 sm:min-h-[64vh] sm:p-5">
            {item.fileType === "image" ? (
              <img
                src={item.sasUrl}
                alt={item.title ?? item.fileName}
                className="max-h-full max-w-full rounded-[1.2rem] object-contain"
                draggable={false}
              />
            ) : (
              <VideoPlayer
                src={item.sasUrl}
                mimeType={item.mimeType}
                fileName={item.fileName}
              />
            )}
          </div>

          <aside className="overflow-y-auto rounded-[1.75rem] border border-white/10 bg-slate-950/68 p-5">
            <div className="space-y-5">
              {slideshowMessage ? (
                <div className="rounded-[1rem] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
                  {slideshowMessage}
                </div>
              ) : null}

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Details
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">
                  {item.title ?? item.fileName}
                </h2>
                <p className="mt-2 text-sm text-slate-400">{item.fileName}</p>
                {item.description ? (
                  <p className="mt-4 text-sm leading-6 text-slate-300">{item.description}</p>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">
                    No description has been added for this item yet.
                  </p>
                )}
              </div>

              <div className="grid gap-3 rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Media Type
                  </p>
                  <p className="mt-1 text-sm text-white">
                    {item.fileType === "image" ? "Image" : "Video"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Size
                  </p>
                  <p className="mt-1 text-sm text-white">{formatBytes(item.sizeBytes)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Share URL
                  </p>
                  <p className="mt-1 break-all text-sm text-slate-300">{shareUrl}</p>
                  {copyState === "failed" ? (
                    <p className="mt-2 text-xs text-amber-300">
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
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    No tags have been added for this item yet.
                  </p>
                )}
              </div>

              {canEditDetails ? (
                <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Admin Edit
                  </p>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-white">
                        Title
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        className="ops-input"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-white">
                        Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={4}
                        className="ops-input min-h-[120px] resize-y"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-white">
                        Tags
                      </label>
                      <input
                        type="text"
                        value={tagsText}
                        onChange={(event) => setTagsText(event.target.value)}
                        placeholder="featured, event, briefing"
                        className="ops-input"
                        disabled={saving}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Separate tags with commas.
                      </p>
                    </div>

                    {saveMessage ? (
                      <p className="text-sm text-emerald-300">{saveMessage}</p>
                    ) : null}
                    {saveError ? (
                      <p className="text-sm text-rose-300">{saveError}</p>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        void handleSaveDetails();
                      }}
                      disabled={saving}
                      className="ops-button"
                    >
                      {saving ? "Saving..." : "Save Details"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        {hasNext ? (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white backdrop-blur"
            aria-label="Next"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {items.length > 1 ? (
        <div className="border-t border-white/10 bg-slate-950/72 px-4 py-4">
          <div className="mx-auto flex max-w-7xl gap-3 overflow-x-auto pb-1">
            {items.map((media, index) => (
              <button
                key={media.id}
                type="button"
                onClick={() => handleSelectIndex(index)}
                className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border ${
                  index === currentIndex
                    ? "border-blue-400 shadow-[0_0_0_2px_rgba(96,165,250,0.35)]"
                    : "border-white/12 opacity-75 hover:opacity-100"
                }`}
                aria-label={`View ${media.title ?? media.fileName}`}
              >
                <img
                  src={media.thumbnailUrl}
                  alt={media.title ?? media.fileName}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {media.fileType === "video" ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
