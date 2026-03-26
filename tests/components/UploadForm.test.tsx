import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UploadForm from "@/components/admin/UploadForm";

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  static reset() {
    MockXMLHttpRequest.instances = [];
  }

  status = 201;
  statusText = "Created";
  responseText = "{}";
  method = "";
  url = "";

  private listeners = new Map<string, () => void>();
  private uploadListeners = new Map<string, (event: ProgressEvent) => void>();

  upload = {
    addEventListener: (type: string, callback: (event: ProgressEvent) => void) => {
      this.uploadListeners.set(type, callback);
    },
  };

  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  addEventListener(type: string, callback: () => void) {
    this.listeners.set(type, callback);
  }

  send() {
    const progress = this.uploadListeners.get("progress");
    progress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
    progress?.({ lengthComputable: true, loaded: 100, total: 100 } as ProgressEvent);

    setTimeout(() => {
      this.listeners.get("load")?.();
    }, 0);
  }
}

describe("UploadForm", () => {
  beforeEach(() => {
    MockXMLHttpRequest.reset();
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues and uploads multiple files one at a time with visible progress", async () => {
    const user = userEvent.setup();

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
      expect(MockXMLHttpRequest.instances).toHaveLength(2);
    });

    expect(MockXMLHttpRequest.instances[0]?.method).toBe("POST");
    expect(MockXMLHttpRequest.instances[0]?.url).toBe("/api/admin/upload");
    expect(MockXMLHttpRequest.instances[1]?.url).toBe("/api/admin/upload");

    expect(await screen.findAllByText(/Upload Progress/i)).toHaveLength(2);
    expect(await screen.findAllByText(/100%/i)).toHaveLength(2);
    expect(await screen.findByText(/Uploaded 2 of 2 file/i)).toBeInTheDocument();
  });

  it("adds dropped files to the queue", () => {
    render(<UploadForm albums={[{ id: "album-1", name: "Alpha Album" }]} />);

    const droppedFile = new File(["dropped"], "dropped.png", {
      type: "image/png",
    });

    fireEvent.dragEnter(screen.getByRole("region", { name: /Upload drop zone/i }), {
      dataTransfer: {
        files: [droppedFile],
        types: ["Files"],
      },
    });

    fireEvent.drop(screen.getByRole("region", { name: /Upload drop zone/i }), {
      dataTransfer: {
        files: [droppedFile],
        types: ["Files"],
      },
    });

    expect(screen.getByText("dropped.png")).toBeInTheDocument();
  });
});
