"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { AlbumListItem, AlbumRecord } from "@/types";

interface Props {
  tenantId: string;
  onCreated?: (album: AlbumListItem) => void;
}

export default function CreateAlbumCard({ tenantId, onCreated }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!tenantId) {
      setError("Select a tenant context before creating a collection.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await apiFetch(
        `/api/admin/albums?tenantId=${encodeURIComponent(tenantId)}`,
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
        }
      );

      if (res.ok) {
        const created = (await res
          .json()
          .catch(() => null)) as AlbumRecord | null;

        if (created && onCreated) {
          onCreated({
            id: created.id,
            tenantId: created.tenantId,
            name: created.name,
            description: created.description,
            coverThumbnailUrl: undefined,
            mediaCount: 0,
            order: created.order,
          });
        }

        setName("");
        setDescription("");
        setOpen(false);
        startTransition(() => {
          router.refresh();
        });
      } else {
        const data = await res.json().catch(() => ({}));
        console.error("Album creation failed", data);
        setError(data.error ?? "Failed to create album.");
      }
    } catch (error) {
      console.error("Album creation request failed", error);
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group surface-card flex aspect-[4/3] flex-col items-start justify-between rounded-[1.5rem] border border-dashed border-[rgba(148,163,184,0.38)] p-5 text-left hover:border-slate-400"
      >
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-700">
          +
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-[color:var(--text-muted)]">
            Create album
          </p>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
            Start a new album
          </h2>
          <p className="text-sm leading-6 text-[color:var(--text-muted)]">
            Add a name, optional description, and make a new collection
            available in this tenant.
          </p>
        </div>
      </button>
    );
  }

  return (
    <div className="surface-card flex aspect-[4/3] flex-col rounded-[1.5rem] p-5">
      <form onSubmit={handleCreate} className="flex h-full flex-col gap-3">
        <div className="space-y-2">
          <p className="text-sm font-medium text-[color:var(--text-muted)]">
            New album
          </p>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
            Enter album details
          </h2>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Album name *"
          required
          autoFocus
          className="ops-input"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mission, event, or delivery summary"
          className="ops-input"
        />

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <div className="mt-auto flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="ops-button"
          >
            {saving ? "Creating..." : "Create Album"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError("");
            }}
            className="ops-button-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
