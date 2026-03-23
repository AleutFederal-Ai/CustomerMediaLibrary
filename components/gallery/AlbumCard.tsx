"use client";

import Link from "next/link";
import { AlbumListItem } from "@/types";

interface Props {
  album: AlbumListItem;
}

export default function AlbumCard({ album }: Props) {
  return (
    <Link
      href={`/album/${album.id}`}
      className="group surface-card-soft block overflow-hidden rounded-[1.4rem] border border-[rgba(140,172,197,0.14)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[rgba(7,18,28,0.88)]">
        {album.coverThumbnailUrl ? (
          <img
            src={album.coverThumbnailUrl}
            alt={album.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(105,211,255,0.18),transparent_44%),linear-gradient(180deg,rgba(14,34,51,0.9),rgba(7,18,28,0.96))]">
            <svg
              className="h-12 w-12 text-[rgba(152,173,191,0.55)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#040a12] via-transparent to-transparent opacity-70" />

        <div className="absolute left-4 top-4">
          <span className="ops-badge ops-badge-info">
            {album.mediaCount.toLocaleString()}{" "}
            {album.mediaCount === 1 ? "item" : "items"}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 space-y-2 p-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#cfeeff] backdrop-blur">
            Collection
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-white transition group-hover:text-[#d6f5ff]">
              {album.name}
            </h2>
            <p className="line-clamp-2 text-sm leading-6 text-[rgba(231,238,245,0.74)]">
              {album.description ?? "Managed album workspace for approved media."}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
