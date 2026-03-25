"use client";

import { useCallback, useEffect, useRef } from "react";
import VideoPlayer from "@/components/video-player/VideoPlayer";
import { apiFetch } from "@/lib/api-fetch";
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

interface Props {
  item: MediaDetail;
  items: MediaListItem[];
  currentIndex: number;
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
  currentIndex,
  onClose,
  onPrev,
  onNext,
  onSelect,
  hasPrev,
  hasNext,
}: Props) {
  const touchStartXRef = useRef<number | null>(null);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onPrev?.();
      if (e.key === "ArrowRight" && hasNext) onNext?.();
    },
    [onClose, onPrev, onNext, hasPrev, hasNext]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[rgba(1,7,12,0.96)] backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={item.fileName}
    >
      <div className="border-b border-white/10 bg-slate-950/70 px-4 py-4">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-400">
              {currentIndex + 1} of {items.length}
            </p>
            <p className="mt-1 truncate text-lg font-semibold tracking-[-0.03em] text-white">
              {item.fileName}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {item.fileType === "image" ? "Image" : "Video"} - {formatBytes(item.sizeBytes)}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={handleDownload} className="ops-button">
              Download
            </button>
            <button type="button" onClick={onClose} className="ops-button-secondary">
              Close
            </button>
          </div>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-6 sm:px-6"
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
            onPrev?.();
          } else if (delta < -60 && hasNext) {
            onNext?.();
          }
          touchStartXRef.current = null;
        }}
      >
        {hasPrev ? (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white backdrop-blur"
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

        <div className="flex h-full max-h-full w-full items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/8 bg-black/25 p-3 sm:p-5">
          {item.fileType === "image" ? (
            <img
              src={item.sasUrl}
              alt={item.fileName}
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

        {hasNext ? (
          <button
            type="button"
            onClick={onNext}
            className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white backdrop-blur"
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

        <div className="absolute inset-0 -z-10" onClick={onClose} aria-hidden="true" />
      </div>

      {items.length > 1 ? (
        <div className="border-t border-white/10 bg-slate-950/72 px-4 py-4">
          <div className="mx-auto flex max-w-7xl gap-3 overflow-x-auto pb-1">
            {items.map((media, index) => (
              <button
                key={media.id}
                type="button"
                onClick={() => onSelect?.(index)}
                className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border ${
                  index === currentIndex
                    ? "border-blue-400 shadow-[0_0_0_2px_rgba(96,165,250,0.35)]"
                    : "border-white/12 opacity-75 hover:opacity-100"
                }`}
                aria-label={`View ${media.fileName}`}
              >
                <img
                  src={media.thumbnailUrl}
                  alt={media.fileName}
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
    </div>
  );
}
