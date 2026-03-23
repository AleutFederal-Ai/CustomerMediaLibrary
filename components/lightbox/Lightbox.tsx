"use client";

import { useEffect, useCallback } from "react";
import VideoPlayer from "@/components/video-player/VideoPlayer";
import { apiFetch } from "@/lib/api-fetch";

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
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
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
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: Props) {
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
      <div className="border-b border-[rgba(140,172,197,0.14)] bg-[rgba(5,16,25,0.84)] px-4 py-4">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="hero-kicker">Secure Viewer</p>
            <p className="mt-2 truncate text-lg font-semibold tracking-[-0.03em] text-white">
              {item.fileName}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {item.fileType.toUpperCase()} - {formatBytes(item.sizeBytes)}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={handleDownload} className="ops-button">
              Download Asset
            </button>
            <button type="button" onClick={onClose} className="ops-button-secondary">
              Close Viewer
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-6 sm:px-6">
        {hasPrev ? (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-black/35 text-white backdrop-blur"
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

        <div className="surface-card flex h-full max-h-full w-full items-center justify-center overflow-hidden rounded-[1.75rem] p-3 sm:p-5">
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
            className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-black/35 text-white backdrop-blur"
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
    </div>
  );
}
