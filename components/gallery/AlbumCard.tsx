"use client";

import Link from "next/link";
import { useState } from "react";
import { AlbumListItem } from "@/types";
import { buildGalleryAlbumPath } from "@/lib/admin-scope";

interface Props {
  album: AlbumListItem;
  tenantSlug?: string;
}

function ShareButton({ album, tenantSlug }: Props) {
  const [copied, setCopied] = useState(false);

  function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const albumIdentifier = album.slug || album.id;
    const path = buildGalleryAlbumPath(tenantSlug, albumIdentifier);
    const fullUrl = `${window.location.origin}${path}`;

    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      title={copied ? "Link copied!" : "Copy album link"}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm backdrop-blur transition hover:bg-white hover:text-slate-900"
    >
      {copied ? (
        <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
      )}
    </button>
  );
}

export default function AlbumCard({ album, tenantSlug }: Props) {
  const albumIdentifier = album.slug || album.id;

  return (
    <div className="group relative">
      <Link
        href={buildGalleryAlbumPath(tenantSlug, albumIdentifier)}
        className="surface-card block overflow-hidden rounded-[1.5rem] border"
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

      {/* Share button overlay — top-right of the card image */}
      <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <ShareButton album={album} tenantSlug={tenantSlug} />
      </div>
    </div>
  );
}
