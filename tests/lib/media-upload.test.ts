import { describe, expect, it } from "vitest";
import { resolveUploadedMediaType } from "@/lib/media-upload";

describe("resolveUploadedMediaType", () => {
  it("accepts videos by extension when the browser provides no mime type", () => {
    expect(
      resolveUploadedMediaType({
        name: "briefing.mp4",
        type: "",
      })
    ).toEqual({
      fileType: "video",
      mimeType: "video/mp4",
    });
  });

  it("accepts browser-recognized video mime types outside the narrow original list", () => {
    expect(
      resolveUploadedMediaType({
        name: "field-report.mkv",
        type: "video/x-matroska",
      })
    ).toEqual({
      fileType: "video",
      mimeType: "video/x-matroska",
    });
  });

  it("rejects unsupported non-media files", () => {
    expect(
      resolveUploadedMediaType({
        name: "notes.txt",
        type: "text/plain",
      })
    ).toBeNull();
  });
});
