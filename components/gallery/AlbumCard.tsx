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
      className="group surface-card block overflow-hidden rounded-[1.5rem] border"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {album.coverThumbnailUrl ? (
          <img
            src={album.coverThumbnailUrl}
            alt={album.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.8),_transparent_42%),linear-gradient(180deg,_#f8fafc,_#e2e8f0)]">
            <svg
              className="h-12 w-12 text-slate-400"
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

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/10 via-transparent to-transparent" />
      </div>

      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="ops-badge ops-badge-neutral">Album</span>
          <span className="text-sm font-medium text-[color:var(--text-muted)]">
            {album.mediaCount.toLocaleString()}{" "}
            {album.mediaCount === 1 ? "item" : "items"}
          </span>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--foreground)] transition group-hover:text-slate-700">
            {album.name}
          </h2>
          <p className="line-clamp-2 text-sm leading-6 text-[color:var(--text-muted)]">
            {album.description ?? "Open this album to view and download media."}
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <span>Open album</span>
          <svg className="h-4 w-4 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </Link>
  );
}
