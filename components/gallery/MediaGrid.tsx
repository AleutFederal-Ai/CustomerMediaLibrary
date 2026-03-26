"use client";

import { useCallback, useEffect, useMemo } from "react";
import { MediaListItem } from "@/types";
import MediaThumbnail from "./MediaThumbnail";

interface Props {
  items: MediaListItem[];
  selectedIds: Set<string>;
  onSelectedChange: (nextSelection: Set<string>) => void;
  onItemClick: (item: MediaListItem) => void;
  onBulkDownload?: (ids: string[]) => void;
  onBulkDelete?: (ids: string[]) => void;
  onMakeAlbumCover?: (id: string) => void;
  albumCoverMediaId?: string;
  deletingSelection?: boolean;
  updatingCover?: boolean;
  canContribute?: boolean;
  onDelete?: (item: MediaListItem) => void;
}

export default function MediaGrid({
  items,
  selectedIds,
  onSelectedChange,
  onItemClick,
  onBulkDownload,
  onBulkDelete,
  onMakeAlbumCover,
  albumCoverMediaId,
  deletingSelection = false,
  updatingCover = false,
  canContribute,
  onDelete,
}: Props) {
  const hasBulkActions =
    Boolean(onBulkDownload) || Boolean(onBulkDelete) || Boolean(onMakeAlbumCover);

  const handleSelect = useCallback((id: string, isSelected: boolean) => {
    onSelectedChange(
      (() => {
        const next = new Set(selectedIds);
        if (isSelected) next.add(id);
        else next.delete(id);
        return next;
      })()
    );
  }, [onSelectedChange, selectedIds]);

  useEffect(() => {
    const validIds = new Set(items.map((item) => item.id));
    const next = new Set([...selectedIds].filter((id) => validIds.has(id)));
    if (next.size !== selectedIds.size) {
      onSelectedChange(next);
    }
  }, [items, onSelectedChange, selectedIds]);

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      onSelectedChange(new Set());
    } else {
      onSelectedChange(new Set(items.map((i) => i.id)));
    }
  };

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );
  const canSetAlbumCover =
    selectedItems.length === 1 && selectedItems[0]?.fileType === "image";
  const selectedCoverId = canSetAlbumCover ? selectedItems[0]?.id : undefined;

  const handleBulkDownload = () => {
    if (selectedIds.size > 0 && onBulkDownload) {
      onBulkDownload(Array.from(selectedIds));
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
      {hasBulkActions ? (
        <div className="surface-card-quiet rounded-[1.25rem] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSelectAll}
                className="ops-button-secondary"
              >
                {selectedIds.size === items.length ? "Deselect All" : "Select All"}
              </button>

              <span className="chip">
                Selected
                <strong>{selectedIds.size}</strong>
              </span>

              <span className="text-sm text-[color:var(--text-muted)]">
                Showing {items.length} file{items.length === 1 ? "" : "s"}
              </span>
            </div>

            {selectedIds.size > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                {onBulkDownload ? (
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
                ) : null}
                {onMakeAlbumCover ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedCoverId) {
                        onMakeAlbumCover(selectedCoverId);
                      }
                    }}
                    disabled={
                      updatingCover ||
                      !canSetAlbumCover ||
                      selectedCoverId === albumCoverMediaId
                    }
                    className="ops-button-secondary disabled:opacity-50"
                  >
                    {selectedCoverId === albumCoverMediaId
                      ? "Album Cover Set"
                      : updatingCover
                        ? "Saving Cover..."
                        : "Make Album Cover"}
                  </button>
                ) : null}
                {onBulkDelete ? (
                  <button
                    type="button"
                    onClick={() => onBulkDelete(Array.from(selectedIds))}
                    disabled={deletingSelection}
                    className="ops-button-secondary text-red-700 disabled:opacity-50"
                  >
                    {deletingSelection ? "Deleting..." : "Delete Selection"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelectedChange(new Set())}
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
            selected={selectedIds.has(item.id)}
            isAlbumCover={item.id === albumCoverMediaId}
            onSelect={hasBulkActions ? handleSelect : undefined}
            onClick={onItemClick}
            canContribute={canContribute}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
