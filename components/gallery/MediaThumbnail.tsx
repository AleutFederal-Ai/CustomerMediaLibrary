"use client";

import { MediaListItem } from "@/types";

interface Props {
  item: MediaListItem;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onClick?: (item: MediaListItem) => void;
}

export default function MediaThumbnail({ item, selected, onSelect, onClick }: Props) {
  return (
    <div
      className={`relative group aspect-square rounded overflow-hidden bg-slate-800 cursor-pointer
        ${selected ? "ring-2 ring-blue-500" : "hover:ring-2 hover:ring-slate-500"}`}
      onClick={() => onClick?.(item)}
    >
      {/* Thumbnail image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.thumbnailUrl}
        alt={item.fileName}
        className="w-full h-full object-cover"
        loading="lazy"
      />

      {/* Video overlay */}
      {item.fileType === "video" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white ml-0.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Selection checkbox */}
      {onSelect && (
        <div
          className="absolute top-2 left-2"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(item.id, !selected);
          }}
        >
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
              ${selected
                ? "bg-blue-600 border-blue-600"
                : "bg-black/50 border-slate-400 opacity-0 group-hover:opacity-100"}`}
          >
            {selected && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Filename on hover */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 translate-y-full group-hover:translate-y-0 transition-transform">
        <p className="text-white text-xs truncate">{item.fileName}</p>
      </div>
    </div>
  );
}
