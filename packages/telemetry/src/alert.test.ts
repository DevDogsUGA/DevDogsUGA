import { afterEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
const getClient = vi.fn();

vi.mock("@sentry/core", () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
  getClient: (...args: unknown[]) => getClient(...args),
}));

const { alert } = await import("./alert.js");

afterEach(() => {
  captureMessage.mockReset();
  getClient.mockReset();
});

describe("alert", () => {
  it("no-ops without an initialized client", () => {
    getClient.mockReturnValue(undefined);
    alert("title", ["a line"]);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("captures a warning-level message with a title-derived fingerprint", () => {
    getClient.mockReturnValue({});
    alert("Airtable sync failing", ["3 rows rejected"]);

    expect(captureMessage).toHaveBeenCalledWith(
      "Airtable sync failing\n• 3 rows rejected",
      expect.objectContaining({
        level: "warning",
        fingerprint: ["alert", "Airtable sync failing"],
        tags: expect.objectContaining({ alert: "true" }),
      }),
    );
  });

  it("merges caller-supplied tags", () => {
    getClient.mockReturnValue({});
    alert("title", [], { tags: { service: "platform" } });

    expect(captureMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tags: { alert: "true", service: "platform" },
      }),
    );
  });

  it("never throws, even if captureMessage throws", () => {
    getClient.mockReturnValue({});
    captureMessage.mockImplementation(() => {
      throw new Error("network down");
    });

    expect(() => alert("title", ["line"])).not.toThrow();
  });

  it("never throws, even if getClient throws", () => {
    getClient.mockImplementation(() => {
      throw new Error("no carrier");
    });

    expect(() => alert("title", ["line"])).not.toThrow();
  });
});
