"use client";

import { useState, useCallback } from "react";
import { MediaListItem } from "@/types";
import MediaThumbnail from "./MediaThumbnail";

interface Props {
  items: MediaListItem[];
  onItemClick: (item: MediaListItem) => void;
  onBulkDownload?: (ids: string[]) => void;
}

export default function MediaGrid({ items, onItemClick, onBulkDownload }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSelect = useCallback((id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

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
      <div className="text-center py-24 text-slate-500">
        <p>No media in this album.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Bulk action bar */}
      {onBulkDownload && (
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            {selected.size === items.length ? "Deselect all" : "Select all"}
          </button>

          {selected.size > 0 && (
            <>
              <span className="text-slate-600 text-sm">
                {selected.size} selected
              </span>
              <button
                type="button"
                onClick={handleBulkDownload}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download selected
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {items.map((item) => (
          <MediaThumbnail
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onSelect={onBulkDownload ? handleSelect : undefined}
            onClick={onItemClick}
          />
        ))}
      </div>
    </div>
  );
}
