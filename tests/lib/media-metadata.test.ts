import { describe, expect, it } from "vitest";
import {
  buildDefaultMediaTitle,
  normalizeMediaTags,
} from "@/lib/media-metadata";

describe("media metadata helpers", () => {
  it("builds a default title from the file name without the extension", () => {
    expect(buildDefaultMediaTitle("mission-photo-01.JPG")).toBe("mission-photo-01");
  });

  it("normalizes tags to lowercase unique values", () => {
    expect(normalizeMediaTags([" Featured ", "briefing", "featured"])).toEqual([
      "featured",
      "briefing",
    ]);
  });

  it("normalizes comma-separated tag input", () => {
    expect(normalizeMediaTags("Alpha, bravo , alpha ,")).toEqual([
      "alpha",
      "bravo",
    ]);
  });
});
