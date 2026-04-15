"use client";

import { MediaListItem } from "@/types";

interface Props {
  item: MediaListItem;
  selected?: boolean;
  isAlbumCover?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onClick?: (item: MediaListItem) => void;
  canContribute?: boolean;
  onDelete?: (item: MediaListItem) => void;
  // Reorder plumbing — wired from MediaGrid.
  draggable?: boolean;
  isDragTarget?: boolean;
  isDragging?: boolean;
  onDragStart?: (id: string) => void;
  onDragOver?: (id: string) => void;
  onDragEnd?: () => void;
  onDrop?: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
}

export default function MediaThumbnail({
  item,
  selected,
  isAlbumCover,
  onSelect,
  onClick,
  canContribute,
  onDelete,
  draggable = false,
  isDragTarget = false,
  isDragging = false,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onMoveUp,
  onMoveDown,
}: Props) {
  return (
    <div
      className={`group surface-card relative aspect-square cursor-pointer overflow-hidden rounded-[1.25rem] border ${
        selected
          ? "border-[rgba(37,99,235,0.42)] shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
          : ""
      } ${
        isDragTarget
          ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-transparent"
          : ""
      } ${isDragging ? "opacity-50" : ""}`}
      onClick={() => onClick?.(item)}
      title={item.title ?? item.fileName}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.effectAllowed = "move";
        // Needed on Firefox to start the drag.
        try {
          event.dataTransfer.setData("text/plain", item.id);
        } catch {
          // Some browsers reject setData in test environments — ignore.
        }
        onDragStart?.(item.id);
      }}
      onDragOver={(event) => {
        if (!draggable) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOver?.(item.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      onDrop={(event) => {
        if (!draggable) return;
        event.preventDefault();
        onDrop?.(item.id);
      }}
    >
      {item.fileType === "link" && !item.thumbnailUrl ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
          <svg className="h-16 w-16 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
      ) : (
        <img
          src={item.thumbnailUrl}
          alt={item.fileName}
          className="h-full w-full bg-slate-100 object-cover transition duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/15 via-transparent to-transparent" />

      {item.fileType === "video" ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/80 bg-slate-950/80 shadow-lg backdrop-blur">
            <svg className="ml-0.5 h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      ) : null}

      {item.fileType === "link" ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/80 bg-slate-950/80 shadow-lg backdrop-blur">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </div>
        </div>
      ) : null}

      {onSelect ? (
        <div
          className="absolute left-3 top-3"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(item.id, !selected);
          }}
        >
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full border shadow-sm ${
              selected
                ? "border-[rgba(37,99,235,0.42)] bg-blue-600 text-white"
                : "border-white/90 bg-white/92 text-slate-500 opacity-0 backdrop-blur group-hover:opacity-100"
            }`}
          >
            {selected ? (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : null}
          </div>
        </div>
      ) : null}

      {isAlbumCover ? (
        <div className="absolute left-3 top-12 rounded-full border border-emerald-200 bg-white/95 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-emerald-700 shadow-sm backdrop-blur">
          Album Cover
        </div>
      ) : null}

      {canContribute && onDelete ? (
        <button
          type="button"
          aria-label="Delete media"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-red-100 bg-white/95 text-red-600 opacity-0 shadow-sm backdrop-blur group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item);
          }}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      ) : null}

      {onMoveUp || onMoveDown ? (
        <div
          className="absolute bottom-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          {onMoveUp ? (
            <button
              type="button"
              aria-label="Move earlier"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-sm backdrop-blur hover:bg-white"
              onClick={(event) => {
                event.stopPropagation();
                onMoveUp(item.id);
              }}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          ) : null}
          {onMoveDown ? (
            <button
              type="button"
              aria-label="Move later"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-sm backdrop-blur hover:bg-white"
              onClick={(event) => {
                event.stopPropagation();
                onMoveDown(item.id);
              }}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      ) : null}

    </div>
  );
}
