"use client";

import { FormEvent, useRef, useState } from "react";
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-white/86">
            Album
          </label>
          <select
            value={albumId}
            onChange={(e) => setAlbumId(e.target.value)}
            required
            className="ops-select"
          >
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-white/86">
            Tags
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="training, exercise-2024, bravo-team"
            className="ops-input"
          />
        </div>
      </div>

      <div className="surface-card-soft rounded-[1.2rem] p-5">
        <label className="mb-2 block text-sm font-medium text-white/86">
          Files
        </label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          required
          onChange={(e) => setFiles(e.target.files)}
          className="w-full cursor-pointer text-sm text-[var(--text-muted)] file:mr-4 file:rounded-full file:border file:border-[rgba(105,211,255,0.22)] file:bg-[rgba(105,211,255,0.12)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#d8f7ff]"
        />
        {files && files.length > 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            {files.length} file{files.length !== 1 ? "s" : ""} selected
          </p>
        ) : null}
      </div>

      {progress ? (
        <div className="surface-card-soft rounded-[1.2rem] p-5">
          <div className="mb-3 flex items-center justify-between text-sm text-[var(--text-muted)]">
            <span>Uploading files...</span>
            <span>
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-[rgba(7,18,28,0.82)]">
            <div
              className="h-2.5 rounded-full bg-[linear-gradient(90deg,var(--accent-strong),var(--accent))] transition-all"
              style={{
                width: `${Math.round((progress.done / progress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <ul className="ops-danger-panel rounded-[1.2rem] px-4 py-4 text-sm">
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="submit"
        disabled={uploading || !files || files.length === 0}
        className="ops-button"
      >
        {uploading ? "Uploading..." : "Upload Media"}
      </button>
    </form>
  );
}
