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
        className="group surface-card-soft flex aspect-[4/3] flex-col items-start justify-between rounded-[1.4rem] border border-dashed border-[rgba(105,211,255,0.26)] p-5 text-left"
      >
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(105,211,255,0.12)] text-2xl text-[#d2f5ff]">
          +
        </div>
        <div className="space-y-2">
          <p className="hero-kicker">Create Collection</p>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">
            Stand up a new album workspace
          </h2>
          <p className="text-sm leading-6 text-[rgba(231,238,245,0.72)]">
            Define a collection, assign a description, and publish a new tenant
            media surface.
          </p>
        </div>
      </button>
    );
  }

  return (
    <div className="surface-card flex aspect-[4/3] flex-col rounded-[1.4rem] p-5">
      <form onSubmit={handleCreate} className="flex h-full flex-col gap-3">
        <div className="space-y-2">
          <p className="hero-kicker">New Collection</p>
          <h2 className="section-title">Initialize album metadata</h2>
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

        {error ? <p className="text-sm text-[#ffb7b7]">{error}</p> : null}

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
