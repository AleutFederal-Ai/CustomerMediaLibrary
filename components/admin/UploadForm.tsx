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

const MAX_QUEUE_ITEMS = 500;

/**
 * Files larger than this threshold are uploaded using the chunked
 * (block blob) path instead of a single multipart POST.
 */
const CHUNKED_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB

/** Size of each chunk sent to the server. */
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

interface Album {
  id: string;
  name: string;
}

interface Props {
  albums: Album[];
  initialAlbumId?: string;
  lockAlbum?: boolean;
  albumLabel?: string;
  variant?: "default" | "compact";
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
  progress: number;
  error?: string;
}

interface UploadResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
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

// ----------------------------------------------------------------
// Client-side video thumbnail extraction
// ----------------------------------------------------------------

const VIDEO_THUMBNAIL_SIZE = 400;
const VIDEO_THUMBNAIL_TIMEOUT_MS = 15000;

/**
 * Extract a single frame from a video file and return it as a 400x400
 * cover-fit WebP Blob. Resolves with `null` on any failure — the server
 * then falls back to its generic placeholder rather than blocking the
 * upload.
 */
async function extractVideoThumbnail(file: File): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.src = objectUrl;

  const cleanup = () => {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      // no-op
    }
  };

  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      const timer = window.setTimeout(() => {
        resolve(null);
      }, VIDEO_THUMBNAIL_TIMEOUT_MS);

      const handleError = () => {
        window.clearTimeout(timer);
        resolve(null);
      };

      video.addEventListener("error", handleError, { once: true });

      video.addEventListener(
        "loadeddata",
        () => {
          // Seek to the first frame that's likely to have real content —
          // 10% into the video, capped at 1s to avoid long dark intros
          // dominating the thumbnail.
          const seekTo = Number.isFinite(video.duration)
            ? Math.min(1, Math.max(0, video.duration * 0.1))
            : 0;
          try {
            video.currentTime = seekTo;
          } catch {
            handleError();
          }
        },
        { once: true }
      );

      video.addEventListener(
        "seeked",
        () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = VIDEO_THUMBNAIL_SIZE;
            canvas.height = VIDEO_THUMBNAIL_SIZE;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              window.clearTimeout(timer);
              resolve(null);
              return;
            }

            // Cover-fit: crop to a square centered on the frame.
            const sw = video.videoWidth;
            const sh = video.videoHeight;
            if (!sw || !sh) {
              window.clearTimeout(timer);
              resolve(null);
              return;
            }
            const side = Math.min(sw, sh);
            const sx = (sw - side) / 2;
            const sy = (sh - side) / 2;
            ctx.drawImage(
              video,
              sx,
              sy,
              side,
              side,
              0,
              0,
              VIDEO_THUMBNAIL_SIZE,
              VIDEO_THUMBNAIL_SIZE
            );

            canvas.toBlob(
              (output) => {
                window.clearTimeout(timer);
                resolve(output);
              },
              "image/webp",
              0.8
            );
          } catch {
            window.clearTimeout(timer);
            resolve(null);
          }
        },
        { once: true }
      );
    });

    return blob;
  } finally {
    cleanup();
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  // Avoid FileReader — we want a synchronous-ish base64 encoding that
  // works in both browser and jsdom without leaking data URL prefixes.
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize))
    );
  }
  return btoa(binary);
}

// ----------------------------------------------------------------
// Single-request upload (files <= CHUNKED_THRESHOLD_BYTES)
// ----------------------------------------------------------------

function uploadFileWithProgress(
  formData: FormData,
  onProgress: (progress: number) => void
): Promise<UploadResponseLike> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/upload");
    xhr.responseType = "text";

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) {
        return;
      }

      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });

    xhr.addEventListener("load", () => {
      onProgress(100);

      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        statusText: xhr.statusText,
        json: async () => {
          if (!xhr.responseText) {
            return {};
          }

          try {
            return JSON.parse(xhr.responseText) as unknown;
          } catch {
            return {};
          }
        },
      });
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error"));
    });

    xhr.send(formData);
  });
}

// ----------------------------------------------------------------
// Chunked upload (files > CHUNKED_THRESHOLD_BYTES)
// ----------------------------------------------------------------

interface InitiateResponse {
  uploadId: string;
  blobName: string;
  fileType: "image" | "video";
  mimeType: string;
  totalChunks: number;
}

async function initiateChunkedUpload(
  file: File,
  albumId: string,
  tags: string
): Promise<InitiateResponse> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES);
  const response = await fetch("/api/admin/upload/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      albumId,
      tags,
      totalChunks,
    }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Initiate failed (${response.status})`);
  }

  return response.json() as Promise<InitiateResponse>;
}

async function uploadChunk(
  blobName: string,
  chunkIndex: number,
  chunkBlob: Blob
): Promise<void> {
  const formData = new FormData();
  formData.append("chunk", chunkBlob);

  const params = new URLSearchParams({
    blobName,
    chunkIndex: String(chunkIndex),
  });

  const response = await fetch(`/api/admin/upload/chunk?${params}`, {
    method: "PUT",
    body: formData,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Chunk ${chunkIndex} failed (${response.status})`);
  }
}

async function commitChunkedUpload(
  initData: InitiateResponse,
  file: File,
  albumId: string,
  tags: string,
  thumbnailBase64: string | null
): Promise<UploadResponseLike> {
  const response = await fetch("/api/admin/upload/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadId: initData.uploadId,
      blobName: initData.blobName,
      fileName: file.name,
      mimeType: initData.mimeType,
      fileType: initData.fileType,
      fileSize: file.size,
      albumId,
      tags,
      totalChunks: initData.totalChunks,
      thumbnailBase64,
    }),
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json: () => response.json(),
  };
}

/**
 * Upload a large file in chunks with progress tracking.
 * Retries individual failed chunks up to 2 times.
 */
async function chunkedUploadWithProgress(
  file: File,
  albumId: string,
  tags: string,
  thumbnailBase64: string | null,
  onProgress: (progress: number) => void
): Promise<UploadResponseLike> {
  // Step 1: Initiate
  const initData = await initiateChunkedUpload(file, albumId, tags);
  const totalChunks = initData.totalChunks;

  // Step 2: Upload chunks sequentially
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE_BYTES;
    const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
    const chunkBlob = file.slice(start, end);

    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await uploadChunk(initData.blobName, i, chunkBlob);
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries - 1) {
          // Wait before retry with exponential backoff
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    // Progress: chunk uploads are ~95% of the work, commit is ~5%
    const chunkProgress = Math.round(((i + 1) / totalChunks) * 95);
    onProgress(chunkProgress);
  }

  // Step 3: Commit
  const commitResponse = await commitChunkedUpload(
    initData,
    file,
    albumId,
    tags,
    thumbnailBase64
  );
  onProgress(100);
  return commitResponse;
}

// ----------------------------------------------------------------
// Component
// ----------------------------------------------------------------

const UploadForm = forwardRef<UploadFormHandle, Props>(function UploadForm({
  albums,
  initialAlbumId,
  lockAlbum = false,
  albumLabel,
  variant = "default",
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
  const batchProgress =
    queue.length === 0
      ? 0
      : Math.round(
          queue.reduce((sum, item) => {
            if (item.status === "uploaded") {
              return sum + 100;
            }

            if (item.status === "uploading") {
              return sum + item.progress;
            }

            return sum;
          }, 0) / queue.length
        );
  const isCompact = variant === "compact";

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
        progress: 0,
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
        progress: 0,
        error: undefined,
      }));

      const useChunked = item.file.size > CHUNKED_THRESHOLD_BYTES;
      const isVideo = item.file.type.startsWith("video/");

      try {
        // Extract a thumbnail frame from video files in the browser so
        // the gallery shows a real preview instead of the dark grey
        // placeholder. Failures fall through silently — the server
        // handles the absence gracefully.
        let thumbnailBlob: Blob | null = null;
        if (isVideo) {
          thumbnailBlob = await extractVideoThumbnail(item.file);
        }

        let response: UploadResponseLike;

        if (useChunked) {
          // Chunked commits use JSON, so base64-encode the small (<100KB)
          // WebP thumbnail for transport.
          const thumbnailBase64 = thumbnailBlob
            ? await blobToBase64(thumbnailBlob)
            : null;

          // Large file: chunked upload via block blob staging
          response = await chunkedUploadWithProgress(
            item.file,
            albumId,
            tags,
            thumbnailBase64,
            (progress) => {
              updateQueueItem(item.id, (current) => ({
                ...current,
                progress,
              }));
            }
          );
        } else {
          // Small file: single-request upload
          const form = new FormData();
          form.append("file", item.file);
          form.append("albumId", albumId);
          form.append("tags", tags);
          if (thumbnailBlob) {
            form.append("thumbnail", thumbnailBlob, "thumbnail.webp");
          }

          response = await uploadFileWithProgress(form, (progress) => {
            updateQueueItem(item.id, (current) => ({
              ...current,
              progress,
            }));
          });
        }

        if (response.ok) {
          uploaded += 1;
          updateQueueItem(item.id, (current) => ({
            ...current,
            status: "uploaded",
            progress: 100,
            error: undefined,
          }));
        } else {
          const data = await response.json().catch(() => ({}));
          failed += 1;
          updateQueueItem(item.id, (current) => ({
            ...current,
            status: "failed",
            progress: 0,
            error:
              (data as { error?: string }).error ??
              response.statusText ??
              "Upload failed",
          }));
        }
      } catch (err) {
        failed += 1;
        updateQueueItem(item.id, (current) => ({
          ...current,
          status: "failed",
          progress: 0,
          error: err instanceof Error ? err.message : "Network error",
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
    <form onSubmit={handleSubmit} className={isCompact ? "space-y-4" : "space-y-5"}>
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
        className={`rounded-[1.2rem] border border-dashed ${isCompact ? "p-4" : "p-5"} transition ${
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
            {!isCompact ? (
              <p className="text-sm font-medium text-[color:var(--text-muted)]">
                Upload queue
              </p>
            ) : null}
            <h3 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
              {isCompact
                ? "Drag files here or browse"
                : "Drag files here or browse from your desktop"}
            </h3>
            <p className="text-sm leading-6 text-[color:var(--text-muted)]">
              {isCompact
                ? `Up to ${MAX_QUEUE_ITEMS} files per batch. Common image and video formats are supported — large video files are uploaded in chunks automatically.`
                : `Add up to ${MAX_QUEUE_ITEMS} images or videos per batch. Files are uploaded one at a time so the queue remains visible and stable. Common video formats such as MP4, MOV, AVI, WEBM, M4V, MPEG, and WMV are supported. Large files are uploaded in chunks automatically — no size limit.`}
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

        {uploading ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[color:var(--text-muted)]">
              <span>Batch progress</span>
              <span>{batchProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
              <div
                className="h-full rounded-full bg-[color:var(--foreground)] transition-[width] duration-200"
                style={{ width: `${batchProgress}%` }}
              />
            </div>
          </div>
        ) : null}
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

      <div className={`surface-card-soft rounded-[1.2rem] ${isCompact ? "p-3.5" : "p-4"}`}>
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
                      {item.file.size > CHUNKED_THRESHOLD_BYTES ? (
                        <span className="ml-2 text-[color:var(--text-muted)] opacity-70">
                          (chunked upload)
                        </span>
                      ) : null}
                    </p>
                    {item.status === "uploading" || item.status === "uploaded" ? (
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center justify-between text-[0.7rem] font-medium uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                          <span>Upload Progress</span>
                          <span>{item.progress}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
                          <div
                            className={`h-full rounded-full transition-[width] duration-200 ${
                              item.status === "uploaded"
                                ? "bg-emerald-500"
                                : "bg-[color:var(--foreground)]"
                            }`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
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
        {!isCompact ? (
          <span className="text-sm text-[color:var(--text-muted)]">
            Files upload sequentially and remain visible here until you clear the
            completed items.
          </span>
        ) : null}
      </div>
    </form>
  );
});

UploadForm.displayName = "UploadForm";

export default UploadForm;
