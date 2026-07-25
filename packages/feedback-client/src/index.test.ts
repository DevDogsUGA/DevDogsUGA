import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackClient } from "./index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("FeedbackClient", () => {
  it("strips a trailing slash from baseUrl when building URLs", async () => {
    const fetchMock = mockFetch({ topics: [] });

    await new FeedbackClient({
      baseUrl: "https://devdogs.uga.edu/",
      clientId: "abc",
    }).getTopics();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://devdogs.uga.edu/api/feedback/abc/topics",
    );
  });

  it("posts feedback with the bearer token and JSON content type", async () => {
    const fetchMock = mockFetch({ feedbackId: "f1" });

    const result = await new FeedbackClient({
      baseUrl: "https://devdogs.uga.edu",
      clientId: "abc",
    }).submitFeedback("user-token", {
      type: "bug_report",
      topic: "Search & Filtering",
      title: "t",
      description: "d",
    });

    expect(result).toEqual({ feedbackId: "f1" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://devdogs.uga.edu/api/feedback/abc");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer user-token",
    );
  });

  it("throws when the API returns a non-2xx status", async () => {
    mockFetch("bad request", 400);

    await expect(
      new FeedbackClient({
        baseUrl: "https://devdogs.uga.edu",
        clientId: "abc",
      }).getTopics(),
    ).rejects.toThrow(/400/);
  });
});
