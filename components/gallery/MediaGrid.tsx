"use client";

import { useCallback, useEffect, useState } from "react";
import { MediaListItem } from "@/types";
import MediaThumbnail from "./MediaThumbnail";

interface Props {
  items: MediaListItem[];
  onItemClick: (item: MediaListItem) => void;
  onBulkDownload?: (ids: string[]) => void;
  canContribute?: boolean;
  onDelete?: (item: MediaListItem) => void;
}

export default function MediaGrid({
  items,
  onItemClick,
  onBulkDownload,
  canContribute,
  onDelete,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSelect = useCallback((id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const validIds = new Set(items.map((item) => item.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const handleSelectAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  const handleBulkDownload = () => {
    if (selected.size > 0 && onBulkDownload) {
      onBulkDownload(Array.from(selected));
    }
  };

  if (items.length === 0) {
    return (
      <div className="ops-empty">
        <p className="text-lg font-semibold text-[color:var(--foreground)]">
          No media in this album.
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-[color:var(--text-muted)]">
          Upload new media or adjust your current filters to expand the visible set.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {onBulkDownload ? (
        <div className="surface-card-quiet rounded-[1.25rem] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSelectAll}
                className="ops-button-secondary"
              >
                {selected.size === items.length ? "Deselect All" : "Select All"}
              </button>

              <span className="chip">
                Selected
                <strong>{selected.size}</strong>
              </span>

              <span className="text-sm text-[color:var(--text-muted)]">
                Showing {items.length} file{items.length === 1 ? "" : "s"}
              </span>
            </div>

            {selected.size > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleBulkDownload}
                  className="ops-button"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download Selection
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="ops-button-ghost"
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
        {items.map((item) => (
          <MediaThumbnail
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onSelect={onBulkDownload ? handleSelect : undefined}
            onClick={onItemClick}
            canContribute={canContribute}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
