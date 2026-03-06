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
      className="group block rounded-lg overflow-hidden bg-slate-800 border border-slate-700 hover:border-slate-500 transition-colors"
    >
      {/* Cover image */}
      <div className="aspect-video bg-slate-700 relative overflow-hidden">
        {album.coverThumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={album.coverThumbnailUrl}
            alt={album.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              className="w-12 h-12 text-slate-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h2 className="text-white font-medium truncate group-hover:text-blue-300 transition-colors">
          {album.name}
        </h2>
        {album.description && (
          <p className="text-slate-400 text-sm mt-0.5 truncate">
            {album.description}
          </p>
        )}
        <p className="text-slate-500 text-xs mt-1">
          {album.mediaCount.toLocaleString()}{" "}
          {album.mediaCount === 1 ? "item" : "items"}
        </p>
      </div>
    </Link>
  );
}
