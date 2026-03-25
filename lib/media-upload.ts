type UploadableFileLike = {
  name: string;
  type: string;
};

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  avi: "video/x-msvideo",
  webm: "video/webm",
  m4v: "video/x-m4v",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  wmv: "video/x-ms-wmv",
};

const ALLOWED_IMAGE_TYPES = new Set(Object.values(IMAGE_MIME_BY_EXTENSION));

export function resolveUploadedMediaType(file: UploadableFileLike): {
  fileType: "image" | "video";
  mimeType: string;
} | null {
  const providedMimeType = file.type.toLowerCase().trim();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ALLOWED_IMAGE_TYPES.has(providedMimeType)) {
    return { fileType: "image", mimeType: providedMimeType };
  }

  if (providedMimeType.startsWith("video/")) {
    return { fileType: "video", mimeType: providedMimeType };
  }

  const imageMimeType = IMAGE_MIME_BY_EXTENSION[extension];
  if (imageMimeType) {
    return { fileType: "image", mimeType: imageMimeType };
  }

  const videoMimeType = VIDEO_MIME_BY_EXTENSION[extension];
  if (videoMimeType) {
    return { fileType: "video", mimeType: videoMimeType };
  }

  return null;
}
