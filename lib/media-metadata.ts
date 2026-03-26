function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "");
}

export function buildDefaultMediaTitle(fileName: string): string {
  const baseName = stripExtension(fileName).trim();
  return baseName || fileName.trim() || "Untitled media";
}

export function normalizeMediaTags(tags: string[] | string): string[] {
  const rawValues = Array.isArray(tags) ? tags : tags.split(",");

  return Array.from(
    new Set(
      rawValues
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}
