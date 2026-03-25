"use client";

import { MediaListItem } from "@/types";

interface Props {
  item: MediaListItem;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onClick?: (item: MediaListItem) => void;
  canContribute?: boolean;
  onDelete?: (item: MediaListItem) => void;
}

export default function MediaThumbnail({
  item,
  selected,
  onSelect,
  onClick,
  canContribute,
  onDelete,
}: Props) {
  return (
    <div
      className={`group surface-card relative aspect-square cursor-pointer overflow-hidden rounded-[1.25rem] border ${
        selected
          ? "border-[rgba(37,99,235,0.42)] shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
          : ""
      }`}
      onClick={() => onClick?.(item)}
    >
      <img
        src={item.thumbnailUrl}
        alt={item.fileName}
        className="h-full w-full bg-slate-100 object-cover transition duration-500 group-hover:scale-[1.03]"
        loading="lazy"
      />

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

      <div className="absolute inset-x-0 bottom-0 translate-y-0 p-3">
        <div className="rounded-2xl border border-white/70 bg-white/88 px-3 py-2 shadow-sm backdrop-blur">
          <p className="truncate text-xs font-medium text-slate-900">{item.fileName}</p>
          <p className="mt-1 text-[0.7rem] uppercase tracking-[0.16em] text-slate-500">
            {item.fileType}
          </p>
        </div>
      </div>
    </div>
  );
}
