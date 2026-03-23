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
  // Keyboard navigation
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
    // Prevent body scroll while lightbox open
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

  const handleDownload = async () => {
    const res = await apiFetch(
      `/api/media/download?id=${item.id}&albumId=${item.albumId}`
    );
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
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={item.fileName}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 shrink-0">
        <div className="text-white min-w-0">
          <p className="font-medium truncate text-sm">{item.fileName}</p>
          <p className="text-slate-400 text-xs">{formatBytes(item.sizeBytes)}</p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            aria-label="Download"
            title="Download"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Media area */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {/* Prev button */}
        {hasPrev && (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-3 p-2 text-slate-400 hover:text-white bg-black/40 hover:bg-black/70 rounded-full transition-colors z-10"
            aria-label="Previous"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {item.fileType === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.sasUrl}
            alt={item.fileName}
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <VideoPlayer
            src={item.sasUrl}
            mimeType={item.mimeType}
            fileName={item.fileName}
          />
        )}

        {/* Next button */}
        {hasNext && (
          <button
            type="button"
            onClick={onNext}
            className="absolute right-3 p-2 text-slate-400 hover:text-white bg-black/40 hover:bg-black/70 rounded-full transition-colors z-10"
            aria-label="Next"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Backdrop click to close */}
        <div
          className="absolute inset-0 -z-10"
          onClick={onClose}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
