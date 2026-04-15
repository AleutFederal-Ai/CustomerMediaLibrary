import { describe, expect, it } from "vitest";
import {
  extractYouTubeId,
  isAllowedUrl,
  sanitizeSubmittedUrl,
} from "@/lib/media-url-allowlist";

describe("isAllowedUrl", () => {
  it("accepts standard YouTube watch URLs", () => {
    expect(isAllowedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isAllowedUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts YouTube short links including tracking params", () => {
    expect(
      isAllowedUrl("https://youtu.be/dQw4w9WgXcQ?si=abc123-xyz")
    ).toBe(true);
  });

  it("accepts mobile and music YouTube URLs", () => {
    expect(isAllowedUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(
      isAllowedUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBe(true);
  });

  it("accepts YouTube live, shorts, and embed paths", () => {
    expect(isAllowedUrl("https://www.youtube.com/live/abc123-XYZ")).toBe(true);
    expect(isAllowedUrl("https://www.youtube.com/shorts/abc123")).toBe(true);
    expect(isAllowedUrl("https://www.youtube.com/embed/abc123")).toBe(true);
  });

  it("accepts Vimeo public, private-hash, channel, and player URLs", () => {
    expect(isAllowedUrl("https://vimeo.com/123456789")).toBe(true);
    expect(isAllowedUrl("https://vimeo.com/123456789/abc123hash")).toBe(true);
    expect(
      isAllowedUrl("https://vimeo.com/channels/staffpicks/123456")
    ).toBe(true);
    expect(isAllowedUrl("https://player.vimeo.com/video/123456")).toBe(true);
  });

  it("accepts Dailymotion and Rumble URLs", () => {
    expect(
      isAllowedUrl("https://www.dailymotion.com/video/x8abc12")
    ).toBe(true);
    expect(isAllowedUrl("https://dai.ly/x8abc12")).toBe(true);
    expect(isAllowedUrl("https://rumble.com/v2abc-my-video")).toBe(true);
  });

  it("rejects non-HTTPS URLs even if the host matches", () => {
    expect(isAllowedUrl("http://www.youtube.com/watch?v=abc")).toBe(false);
  });

  it("rejects hosts outside the allowlist", () => {
    expect(isAllowedUrl("https://evil.example.com/watch?v=abc")).toBe(false);
    expect(isAllowedUrl("https://tiktok.com/@user/video/1")).toBe(false);
  });

  it("rejects malformed URLs without throwing", () => {
    expect(isAllowedUrl("not a url")).toBe(false);
    expect(isAllowedUrl("")).toBe(false);
  });
});

describe("sanitizeSubmittedUrl", () => {
  it("trims whitespace", () => {
    expect(sanitizeSubmittedUrl("  https://youtu.be/abc  ")).toBe(
      "https://youtu.be/abc"
    );
  });

  it("strips Outlook angle-bracket wrappers", () => {
    expect(
      sanitizeSubmittedUrl("<https://www.youtube.com/watch?v=abc>")
    ).toBe("https://www.youtube.com/watch?v=abc");
  });

  it("is a no-op on clean URLs", () => {
    expect(sanitizeSubmittedUrl("https://vimeo.com/123")).toBe(
      "https://vimeo.com/123"
    );
  });
});

describe("extractYouTubeId", () => {
  it("extracts ids from watch, short, embed, shorts, and live URLs", () => {
    expect(
      extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(
      extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")
    ).toBe("dQw4w9WgXcQ");
    expect(
      extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")
    ).toBe("dQw4w9WgXcQ");
    expect(
      extractYouTubeId("https://m.youtube.com/live/dQw4w9WgXcQ")
    ).toBe("dQw4w9WgXcQ");
  });

  it("returns null for non-YouTube URLs", () => {
    expect(extractYouTubeId("https://vimeo.com/123")).toBeNull();
  });
});
