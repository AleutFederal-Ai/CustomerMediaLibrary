"use client";

import { useState } from "react";
import { AlbumRecord } from "@/types";

interface Props {
  initialAlbums: AlbumRecord[];
}

export default function AlbumManager({ initialAlbums }: Props) {
  const [albums, setAlbums] = useState(initialAlbums);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/admin/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
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

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete album "${name}" and all its media? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/admin/albums?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setAlbums((prev) => prev.filter((a) => a.id !== id));
      } else {
        alert("Failed to delete album.");
      }
    } catch {
      alert("Network error.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-medium">Albums</h2>
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
            <label className="block text-sm text-slate-300 mb-1">Name *</label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Description</label>
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
            {saving ? "Creating…" : "Create Album"}
          </button>
        </form>
      )}

      <div className="divide-y divide-slate-700">
        {albums
          .filter((a) => !a.isDeleted)
          .map((album) => (
            <div
              key={album.id}
              className="flex items-center justify-between py-3"
            >
              <div>
                <p className="text-white font-medium">{album.name}</p>
                {album.description && (
                  <p className="text-slate-400 text-sm">{album.description}</p>
                )}
                <p className="text-slate-500 text-xs">
                  Created {new Date(album.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(album.id, album.name)}
                className="text-red-400 hover:text-red-300 text-sm transition-colors"
              >
                Delete
              </button>
            </div>
          ))}

        {albums.filter((a) => !a.isDeleted).length === 0 && (
          <p className="text-slate-500 py-4 text-center">No albums yet.</p>
        )}
      </div>
    </div>
  );
}
