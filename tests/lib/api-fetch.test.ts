import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-fetch";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults GET requests to no-store with same-origin credentials", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    await apiFetch("/api/me");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      })
    );
  });

  it("preserves explicit cache options when provided", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    await apiFetch("/api/health", { cache: "force-cache" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({
        cache: "force-cache",
        credentials: "same-origin",
      })
    );
  });
});
