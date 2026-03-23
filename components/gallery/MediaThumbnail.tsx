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
      className={`group relative aspect-square overflow-hidden rounded-[1.2rem] border cursor-pointer ${
        selected
          ? "border-[rgba(105,211,255,0.46)] shadow-[0_0_0_3px_rgba(105,211,255,0.14)]"
          : "border-[rgba(140,172,197,0.12)]"
      }`}
      onClick={() => onClick?.(item)}
    >
      <img
        src={item.thumbnailUrl}
        alt={item.fileName}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        loading="lazy"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-[#06101a] via-transparent to-transparent opacity-80" />

      {item.fileType === "video" ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/14 bg-black/45 backdrop-blur">
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
            className={`flex h-6 w-6 items-center justify-center rounded-full border text-white ${
              selected
                ? "border-[rgba(105,211,255,0.46)] bg-[rgba(25,134,179,0.96)]"
                : "border-white/30 bg-black/36 opacity-0 backdrop-blur group-hover:opacity-100"
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
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[rgba(101,29,29,0.78)] text-white opacity-0 backdrop-blur group-hover:opacity-100"
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
        <div className="rounded-2xl border border-white/8 bg-black/26 px-3 py-2 backdrop-blur">
          <p className="truncate text-xs font-medium text-white">{item.fileName}</p>
          <p className="mt-1 text-[0.7rem] uppercase tracking-[0.16em] text-[rgba(231,238,245,0.64)]">
            {item.fileType}
          </p>
        </div>
      </div>
    </div>
  );
}
