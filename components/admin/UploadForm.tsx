"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiFetch } from "@/lib/api-fetch";

const MAX_QUEUE_ITEMS = 20;

interface Album {
  id: string;
  name: string;
}

interface Props {
  albums: Album[];
  initialAlbumId?: string;
  lockAlbum?: boolean;
  albumLabel?: string;
  onSuccess?: () => void;
}

export interface UploadFormHandle {
  queueFiles: (files: File[]) => void;
  openFilePicker: () => void;
}

type UploadStatus = "queued" | "uploading" | "uploaded" | "failed";

interface UploadQueueItem {
  id: string;
  file: File;
  status: UploadStatus;
  error?: string;
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (sizeBytes >= 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${sizeBytes} B`;
}

function getStatusLabel(status: UploadStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "uploading":
      return "Uploading";
    case "uploaded":
      return "Uploaded";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function getStatusClass(status: UploadStatus): string {
  switch (status) {
    case "uploading":
      return "ops-badge ops-badge-info";
    case "uploaded":
      return "ops-badge ops-badge-success";
    case "failed":
      return "ops-badge ops-badge-danger";
    case "queued":
    default:
      return "ops-badge ops-badge-neutral";
  }
}

function createQueueId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
}

const UploadForm = forwardRef<UploadFormHandle, Props>(function UploadForm({
  albums,
  initialAlbumId,
  lockAlbum = false,
  albumLabel,
  onSuccess,
}: Props, ref) {
  const [albumId, setAlbumId] = useState(initialAlbumId ?? albums[0]?.id ?? "");
  const [tags, setTags] = useState("");
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<{
    uploaded: number;
    failed: number;
    total: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.id === albumId) ?? null,
    [albumId, albums]
  );

  const queuedCount = queue.filter((item) => item.status === "queued").length;
  const uploadedCount = queue.filter((item) => item.status === "uploaded").length;
  const failedCount = queue.filter((item) => item.status === "failed").length;
  const uploadingCount = queue.filter((item) => item.status === "uploading").length;

  function updateQueueItem(
    itemId: string,
    updater: (item: UploadQueueItem) => UploadQueueItem
  ) {
    setQueue((current) =>
      current.map((item) => (item.id === itemId ? updater(item) : item))
    );
  }

  function addFiles(incomingFiles: File[]) {
    if (incomingFiles.length === 0) {
      return;
    }

    setNotice("");
    setSummary(null);

    setQueue((current) => {
      const availableSlots = MAX_QUEUE_ITEMS - current.length;

      if (availableSlots <= 0) {
        setNotice(`The upload queue is limited to ${MAX_QUEUE_ITEMS} files at a time.`);
        return current;
      }

      const existingKeys = new Set(
        current.map(
          (item) =>
            `${item.file.name}-${item.file.size}-${item.file.lastModified}`
        )
      );

      const nextFiles = incomingFiles
        .filter((file) => {
          const key = `${file.name}-${file.size}-${file.lastModified}`;
          return !existingKeys.has(key);
        })
        .slice(0, availableSlots);

      if (nextFiles.length < incomingFiles.length) {
        setNotice(
          `Added ${nextFiles.length} file${nextFiles.length === 1 ? "" : "s"}. The queue allows up to ${MAX_QUEUE_ITEMS} items and skips duplicates.`
        );
      }

      const nextItems = nextFiles.map((file) => ({
        id: createQueueId(file),
        file,
        status: "queued" as const,
      }));

      return [...current, ...nextItems];
    });
  }

  useImperativeHandle(
    ref,
    () => ({
      queueFiles(files: File[]) {
        if (!uploading) {
          addFiles(files);
        }
      },
      openFilePicker() {
        if (!uploading && queue.length < MAX_QUEUE_ITEMS) {
          fileInputRef.current?.click();
        }
      },
    }),
    [addFiles, queue.length, uploading]
  );

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function removeQueueItem(itemId: string) {
    setQueue((current) => current.filter((item) => item.id !== itemId));
  }

  function clearCompleted() {
    setQueue((current) =>
      current.filter(
        (item) => item.status === "queued" || item.status === "uploading"
      )
    );
    setSummary(null);
    setNotice("");
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!uploading) {
      setDropActive(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);

    if (uploading) {
      return;
    }

    addFiles(Array.from(event.dataTransfer.files ?? []));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!albumId) {
      setNotice("Select an album before uploading media.");
      return;
    }

    const pendingItems = queue.filter(
      (item) => item.status === "queued" || item.status === "failed"
    );

    if (pendingItems.length === 0) {
      setNotice("Add files to the queue before starting the upload.");
      return;
    }

    setUploading(true);
    setNotice("");
    setSummary(null);

    let uploaded = 0;
    let failed = 0;

    for (const item of pendingItems) {
      updateQueueItem(item.id, (current) => ({
        ...current,
        status: "uploading",
        error: undefined,
      }));

      const form = new FormData();
      form.append("file", item.file);
      form.append("albumId", albumId);
      form.append("tags", tags);

      try {
        const response = await apiFetch("/api/admin/upload", {
          method: "POST",
          body: form,
        });

        if (response.ok) {
          uploaded += 1;
          updateQueueItem(item.id, (current) => ({
            ...current,
            status: "uploaded",
            error: undefined,
          }));
        } else {
          const data = await response.json().catch(() => ({}));
          failed += 1;
          updateQueueItem(item.id, (current) => ({
            ...current,
            status: "failed",
            error:
              (data as { error?: string }).error ??
              response.statusText ??
              "Upload failed",
          }));
        }
      } catch {
        failed += 1;
        updateQueueItem(item.id, (current) => ({
          ...current,
          status: "failed",
          error: "Network error",
        }));
      }
    }

    setUploading(false);
    setSummary({
      uploaded,
      failed,
      total: pendingItems.length,
    });

    if (uploaded > 0) {
      if (failed === 0) {
        setTags("");
      }
      onSuccess?.();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Album
          </label>
          {lockAlbum && selectedAlbum ? (
            <div className="surface-card-soft rounded-[1rem] px-4 py-3">
              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                {albumLabel ?? selectedAlbum.name}
              </p>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                Files in this queue will be uploaded into the currently selected
                album.
              </p>
            </div>
          ) : (
            <select
              value={albumId}
              onChange={(event) => setAlbumId(event.target.value)}
              required
              disabled={uploading}
              className="ops-select disabled:opacity-60"
            >
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Tags
          </label>
          <input
            type="text"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="training, exercise-2024, bravo-team"
            disabled={uploading}
            className="ops-input disabled:opacity-60"
          />
        </div>
      </div>

      <div
        className={`rounded-[1.2rem] border border-dashed p-5 transition ${
          dropActive
            ? "border-[rgba(37,99,235,0.4)] bg-[rgba(37,99,235,0.08)]"
            : "surface-card-quiet border-[rgba(148,163,184,0.24)]"
        }`}
        role="region"
        aria-label="Upload drop zone"
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          aria-label="Select media files"
          className="sr-only"
          onChange={handleFileSelection}
          disabled={uploading}
        />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-[color:var(--text-muted)]">
              Upload queue
            </p>
            <h3 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
              Drag files here or browse from your desktop
            </h3>
            <p className="text-sm leading-6 text-[color:var(--text-muted)]">
              Add up to {MAX_QUEUE_ITEMS} images or videos per batch. Files are
              uploaded one at a time so the queue remains visible and stable.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || queue.length >= MAX_QUEUE_ITEMS}
            className="ops-button-secondary"
          >
            Browse Files
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="chip">
            Queued
            <strong>{queuedCount}</strong>
          </span>
          <span className="chip">
            Uploaded
            <strong>{uploadedCount}</strong>
          </span>
          <span className="chip">
            Failed
            <strong>{failedCount}</strong>
          </span>
          {uploadingCount > 0 ? (
            <span className="chip chip-accent">
              In Progress
              <strong>{uploadingCount}</strong>
            </span>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="ops-success-panel rounded-[1rem] px-4 py-3 text-sm">
          Uploaded {summary.uploaded} of {summary.total} file
          {summary.total === 1 ? "" : "s"}
          {summary.failed > 0 ? ` with ${summary.failed} failure${summary.failed === 1 ? "" : "s"}.` : "."}
        </div>
      ) : null}

      {notice ? (
        <div className="ops-warning-panel rounded-[1rem] px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}

      <div className="surface-card-soft rounded-[1.2rem] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[color:var(--foreground)]">
              Files waiting to upload
            </p>
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">
              Remove any item before starting the batch, or retry failed items
              by running the queue again.
            </p>
          </div>
          {queue.length > 0 ? (
            <button
              type="button"
              onClick={clearCompleted}
              disabled={uploading}
              className="ops-button-ghost"
            >
              Clear Completed
            </button>
          ) : null}
        </div>

        {queue.length > 0 ? (
          <div className="mt-4 space-y-3">
            {queue.map((item) => (
              <div
                key={item.id}
                className="surface-card-quiet rounded-[1rem] border px-4 py-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
                        {item.file.name}
                      </p>
                      <span className={getStatusClass(item.status)}>
                        {getStatusLabel(item.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {formatFileSize(item.file.size)}
                    </p>
                    {item.error ? (
                      <p className="mt-2 text-xs text-red-700">{item.error}</p>
                    ) : null}
                  </div>

                  {item.status !== "uploading" ? (
                    <button
                      type="button"
                      onClick={() => removeQueueItem(item.id)}
                      disabled={uploading}
                      className="ops-button-ghost !w-auto text-xs"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ops-empty mt-4 !py-8">
            <p className="text-base font-semibold text-[color:var(--foreground)]">
              No files in the queue yet.
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-[color:var(--text-muted)]">
              Drag media from your desktop onto the drop zone above, or use the
              browse button to build the next batch.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={uploading || queue.length === 0 || !albumId}
          className="ops-button"
        >
          {uploading ? "Uploading Queue..." : "Start Upload Queue"}
        </button>
        <span className="text-sm text-[color:var(--text-muted)]">
          Files upload sequentially and remain visible here until you clear the
          completed items.
        </span>
      </div>
    </form>
  );
});

UploadForm.displayName = "UploadForm";

export default UploadForm;
