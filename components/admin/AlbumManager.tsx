"use client";

import { useEffect, useState } from "react";
import { AlbumRecord, MediaListItem } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
  initialAlbums: AlbumRecord[];
}

// ─── Cover image picker modal ──────────────────────────────────────────────

function CoverPicker({
  albumId,
  onSelect,
  onClose,
}: {
  albumId: string;
  onSelect: (mediaId: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch media for this album on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/api/search?albumId=${albumId}&type=image`);
        if (res.ok) {
          const data = await res.json();
          setItems(data.items ?? data);
        } else {
          setError("Failed to load images");
        }
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [albumId]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h3 className="text-white font-medium">Select Cover Image</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg"
          >
            &times;
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <p className="text-red-400 text-sm text-center py-4">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">
              No images in this album yet. Upload images first.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="aspect-square rounded overflow-hidden border-2 border-transparent hover:border-blue-500 transition-colors"
                >
                  <img
                    src={item.thumbnailUrl}
                    alt={item.fileName}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Album row (view / edit modes) ─────────────────────────────────────────

function AlbumRow({
  album,
  index,
  total,
  onUpdate,
  onDelete,
  onReorder,
}: {
  album: AlbumRecord;
  index: number;
  total: number;
  onUpdate: (id: string, changes: Partial<AlbumRecord>) => Promise<boolean>;
  onDelete: (id: string, name: string) => void;
  onReorder: (index: number, direction: "up" | "down") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(album.name);
  const [description, setDescription] = useState(album.description ?? "");
  const [saving, setSaving] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const ok = await onUpdate(album.id, {
      name: name.trim(),
      description: description.trim(),
    });
    setSaving(false);
    if (ok) setEditing(false);
  }

  function handleCancel() {
    setName(album.name);
    setDescription(album.description ?? "");
    setEditing(false);
  }

  async function handleCoverSelect(mediaId: string) {
    setShowCoverPicker(false);
    await onUpdate(album.id, { coverMediaId: mediaId });
  }

  if (editing) {
    return (
      <div className="p-4 bg-slate-800 border border-slate-600 rounded-lg space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded transition-colors"
          >
            {saving ? "Saving\u2026" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Reorder buttons */}
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => onReorder(index, "up")}
              disabled={index === 0}
              className="text-slate-500 hover:text-white disabled:opacity-20 text-xs leading-none transition-colors"
              title="Move up"
            >
              &#9650;
            </button>
            <button
              type="button"
              onClick={() => onReorder(index, "down")}
              disabled={index === total - 1}
              className="text-slate-500 hover:text-white disabled:opacity-20 text-xs leading-none transition-colors"
              title="Move down"
            >
              &#9660;
            </button>
          </div>

          <div className="min-w-0">
            <p className="text-white font-medium">{album.name}</p>
            {album.description && (
              <p className="text-slate-400 text-sm truncate">
                {album.description}
              </p>
            )}
            <p className="text-slate-500 text-xs">
              Created {new Date(album.createdAt).toLocaleDateString()}
              {album.coverMediaId && " \u00B7 Cover set"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowCoverPicker(true)}
            className="text-slate-400 hover:text-white text-sm transition-colors"
            title="Set cover image"
          >
            Cover
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(album.id, album.name)}
            className="text-red-400 hover:text-red-300 text-sm transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {showCoverPicker && (
        <CoverPicker
          albumId={album.id}
          onSelect={handleCoverSelect}
          onClose={() => setShowCoverPicker(false)}
        />
      )}
    </>
  );
}

// ─── Main AlbumManager ─────────────────────────────────────────────────────

export default function AlbumManager({ initialAlbums }: Props) {
  const [albums, setAlbums] = useState(initialAlbums);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const activeAlbums = albums
    .filter((a) => !a.isDeleted)
    .sort((a, b) => a.order - b.order);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");

    try {
      const res = await apiFetch("/api/admin/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim(),
          order: activeAlbums.length,
        }),
      });

      if (res.ok) {
        const created: AlbumRecord = await res.json();
        setAlbums((prev) => [...prev, created]);
        setNewName("");
        setNewDesc("");
        setCreating(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to create album");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(
    id: string,
    changes: Partial<AlbumRecord>
  ): Promise<boolean> {
    try {
      const res = await apiFetch(`/api/admin/albums?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (res.ok) {
        const updated: AlbumRecord = await res.json();
        setAlbums((prev) => prev.map((a) => (a.id === id ? updated : a)));
        return true;
      }
      alert("Failed to update album.");
      return false;
    } catch {
      alert("Network error.");
      return false;
    }
  }

  async function handleDelete(id: string, name: string) {
    if (
      !confirm(
        `Delete album "${name}" and all its media? This cannot be undone.`
      )
    )
      return;

    try {
      const res = await apiFetch(`/api/admin/albums?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAlbums((prev) => prev.filter((a) => a.id !== id));
      } else {
        alert("Failed to delete album.");
      }
    } catch {
      alert("Network error.");
    }
  }

  async function handleReorder(index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= activeAlbums.length) return;

    const current = activeAlbums[index];
    const swap = activeAlbums[swapIndex];

    // Optimistic UI: swap order values locally
    setAlbums((prev) =>
      prev.map((a) => {
        if (a.id === current.id) return { ...a, order: swap.order };
        if (a.id === swap.id) return { ...a, order: current.order };
        return a;
      })
    );

    // Persist both order changes
    await Promise.all([
      apiFetch(`/api/admin/albums?id=${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: swap.order }),
      }),
      apiFetch(`/api/admin/albums?id=${swap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: current.order }),
      }),
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-medium">
          Albums ({activeAlbums.length})
        </h2>
        <button
          type="button"
          onClick={() => setCreating(!creating)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
        >
          {creating ? "Cancel" : "+ New Album"}
        </button>
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="p-4 bg-slate-800 border border-slate-700 rounded-lg space-y-3"
        >
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded"
          >
            {saving ? "Creating\u2026" : "Create Album"}
          </button>
        </form>
      )}

      <div className="divide-y divide-slate-700">
        {activeAlbums.map((album, index) => (
          <AlbumRow
            key={album.id}
            album={album}
            index={index}
            total={activeAlbums.length}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onReorder={handleReorder}
          />
        ))}

        {activeAlbums.length === 0 && (
          <p className="text-slate-500 py-4 text-center">No albums yet.</p>
        )}
      </div>
    </div>
  );
}
