/**
 * Allowed external video providers for the "Add URL" flow.
 *
 * Patterns require HTTPS and accept the common subdomain/path variants
 * users actually paste (mobile, music, live, shorts, private Vimeo
 * links with hashes, etc.). Keep this list tight — every new entry
 * widens the trust boundary.
 */

const ALLOWED_URL_PATTERNS: RegExp[] = [
  // YouTube — desktop, mobile, music, embed, shorts, live, /v/
  /^https:\/\/(www\.|m\.|music\.)?youtube\.com\/watch\?.*v=[\w-]+/,
  /^https:\/\/(www\.|m\.)?youtube\.com\/(embed|shorts|live|v)\/[\w-]+/,
  /^https:\/\/youtu\.be\/[\w-]+/,
  // Vimeo — public, private/unlisted (hash suffix), channels, groups, player
  /^https:\/\/(www\.)?vimeo\.com\/(channels\/[\w-]+\/|groups\/[\w-]+\/videos\/)?\d+(\/[\w-]+)?/,
  /^https:\/\/player\.vimeo\.com\/video\/\d+/,
  // Dailymotion
  /^https:\/\/(www\.)?dailymotion\.com\/video\/[\w-]+/,
  /^https:\/\/dai\.ly\/[\w-]+/,
  // Rumble
  /^https:\/\/(www\.)?rumble\.com\/[\w-]+/,
];

/**
 * Strip whitespace and the `<` / `>` wrappers Outlook and some chat
 * clients add when users copy a URL from a hyperlink. Safe to call on
 * any user-supplied string.
 */
export function sanitizeSubmittedUrl(raw: string): string {
  return raw.trim().replace(/^<+/, "").replace(/>+$/, "").trim();
}

/**
 * Returns true iff the URL is HTTPS and matches one of the allowed
 * provider patterns. Never throws — returns false on malformed URLs.
 */
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_URL_PATTERNS.some((pattern) => pattern.test(url));
  } catch {
    return false;
  }
}

/**
 * Pull the YouTube video id out of a wide variety of YouTube URL shapes.
 * Returns null for non-YouTube URLs or URLs we don't recognize.
 */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:www\.|m\.|music\.)?youtube\.com\/watch\?.*v=([\w-]+)/,
    /youtu\.be\/([\w-]+)/,
    /(?:www\.|m\.)?youtube\.com\/embed\/([\w-]+)/,
    /(?:www\.|m\.)?youtube\.com\/shorts\/([\w-]+)/,
    /(?:www\.|m\.)?youtube\.com\/live\/([\w-]+)/,
    /(?:www\.|m\.)?youtube\.com\/v\/([\w-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match?.[1] ?? null;
}
