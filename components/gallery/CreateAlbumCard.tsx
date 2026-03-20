"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateAlbumCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/admin/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });

      if (res.ok) {
        setName("");
        setDescription("");
        setOpen(false);
        router.refresh();
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center justify-center aspect-[4/3] rounded-lg border-2 border-dashed border-slate-600 hover:border-blue-500 bg-slate-800/50 hover:bg-slate-800 transition-colors group cursor-pointer"
      >
        <span className="text-3xl text-slate-500 group-hover:text-blue-400 transition-colors">
          +
        </span>
        <span className="text-slate-400 group-hover:text-blue-300 text-sm mt-1 transition-colors">
          Create Album
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col aspect-[4/3] rounded-lg border border-slate-600 bg-slate-800 p-4">
      <form onSubmit={handleCreate} className="flex flex-col h-full gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Album name *"
          required
          autoFocus
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex gap-2 mt-auto">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded transition-colors"
          >
            {saving ? "Creating\u2026" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError("");
            }}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
