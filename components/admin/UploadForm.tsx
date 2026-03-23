"use client";

import { useState, useRef, FormEvent } from "react";
import { apiFetch } from "@/lib/api-fetch";

interface Album {
  id: string;
  name: string;
}

interface Props {
  albums: Album[];
  onSuccess?: () => void;
}

export default function UploadForm({ albums, onSuccess }: Props) {
  const [albumId, setAlbumId] = useState(albums[0]?.id ?? "");
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!files || files.length === 0 || !albumId) return;

    setUploading(true);
    setErrors([]);
    setProgress({ done: 0, total: files.length });

    const errs: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const form = new FormData();
      form.append("file", file);
      form.append("albumId", albumId);
      form.append("tags", tags);

      try {
        const res = await apiFetch("/api/admin/upload", {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          errs.push(`${file.name}: ${data.error ?? res.statusText}`);
        }
      } catch {
        errs.push(`${file.name}: Network error`);
      }

      setProgress({ done: i + 1, total: files.length });
    }

    setUploading(false);
    setErrors(errs);

    if (errs.length === 0) {
      setFiles(null);
      setTags("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSuccess?.();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Album
        </label>
        <select
          value={albumId}
          onChange={(e) => setAlbumId(e.target.value)}
          required
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Files
        </label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          required
          onChange={(e) => setFiles(e.target.files)}
          className="w-full text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-slate-600 file:text-slate-200 file:text-sm hover:file:bg-slate-500"
        />
        {files && files.length > 0 && (
          <p className="text-slate-400 text-xs mt-1">
            {files.length} file{files.length !== 1 ? "s" : ""} selected
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Tags{" "}
          <span className="text-slate-500 font-normal">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="training, exercise-2024, bravo-team"
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {progress && (
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Uploading…</span>
            <span>
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{
                width: `${Math.round((progress.done / progress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <ul className="text-red-400 text-sm space-y-1">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={uploading || !files || files.length === 0}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors text-sm font-medium"
      >
        {uploading ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
