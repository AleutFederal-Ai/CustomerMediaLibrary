export function sanitizeNextPath(nextPath?: string | null): string | null {
  const raw = nextPath?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }

  let normalizedPath = raw;
  try {
    const parsed = new URL(raw, "http://localhost");
    if (parsed.origin !== "http://localhost") {
      return null;
    }
    normalizedPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }

  if (
    normalizedPath === "/login" ||
    /^\/t\/[^/]+\/login\/?$/.test(normalizedPath) ||
    normalizedPath.startsWith("/api/auth/")
  ) {
    return null;
  }

  return normalizedPath;
}
