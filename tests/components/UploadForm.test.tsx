import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UploadForm from "@/components/admin/UploadForm";

describe("UploadForm", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("queues and uploads multiple files one at a time", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    render(<UploadForm albums={[{ id: "album-1", name: "Alpha Album" }]} />);

    const firstFile = new File(["alpha"], "alpha.png", {
      type: "image/png",
    });
    const secondFile = new File(["bravo"], "bravo.jpg", {
      type: "image/jpeg",
    });

    await user.upload(screen.getByLabelText(/Select media files/i), [
      firstFile,
      secondFile,
    ]);

    expect(screen.getByText("alpha.png")).toBeInTheDocument();
    expect(screen.getByText("bravo.jpg")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Start Upload Queue/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/admin/upload",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/admin/upload",
      expect.objectContaining({
        method: "POST",
      })
    );

    expect(await screen.findByText(/Uploaded 2 of 2 file/i)).toBeInTheDocument();
  });
});
