import { describe, expect, it, vi } from "vitest";
import {
  fileReport,
  listFeedbackTopics,
  listReportReasons,
  myReports,
  reportOutcomes,
  submitFeedback,
  type ModerationClient,
} from "./index.js";

/**
 * These assert the wire shape, not behaviour — behaviour lives in SQL and is
 * covered by the persona suite in `packages/sb/testing`.
 *
 * The wire shape is still worth pinning. Every argument name here is a
 * positional-by-name contract with a Postgres function signature, and a typo
 * surfaces at runtime as PostgREST failing to find an overload rather than as a
 * type error. The Flutter app passes the same names by hand, so these double as
 * the reference for what those names are.
 */
function stubClient(
  data: unknown = null,
  error: { message: string } | null = null,
) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const client: ModerationClient = { schema: vi.fn().mockReturnValue({ rpc }) };
  return { client, rpc };
}

describe("schema hop", () => {
  it("targets `platform`, whatever schema the caller's client defaults to", async () => {
    const { client } = stubClient([]);
    await listReportReasons(client, "forum");
    expect(client.schema).toHaveBeenCalledWith("platform");
  });
});

describe("argument names", () => {
  it("fileReport maps to file_report", async () => {
    const { client, rpc } = stubClient({ reportId: "r1", corroborated: false });

    const result = await fileReport(client, {
      app: "forum",
      contentType: "resource",
      contentRef: "abc",
      reasonId: "reason-1",
      description: "spam",
    });

    expect(rpc).toHaveBeenCalledWith("file_report", {
      app_slug: "forum",
      content_type: "resource",
      content_ref: "abc",
      reason_id: "reason-1",
      description: "spam",
    });
    expect(result).toEqual({ reportId: "r1", corroborated: false });
  });

  it("fileReport sends an explicit null for an omitted description", async () => {
    // Not `undefined`: supabase-js would drop the key, and PostgREST resolves
    // overloads by the set of argument names it receives.
    const { client, rpc } = stubClient({ reportId: "r1", corroborated: false });
    await fileReport(client, {
      app: "forum",
      contentType: "resource",
      contentRef: "abc",
      reasonId: "reason-1",
    });
    expect(rpc.mock.calls[0]?.[1]).toHaveProperty("description", null);
  });

  it("submitFeedback maps to submit_feedback", async () => {
    const { client, rpc } = stubClient({ feedbackId: "f1" });

    await submitFeedback(client, {
      app: "forum",
      type: "bug_report",
      title: "Broken",
      description: "It broke.",
      topicId: "topic-1",
      severity: "high",
    });

    expect(rpc).toHaveBeenCalledWith("submit_feedback", {
      app_slug: "forum",
      feedback_type: "bug_report",
      title: "Broken",
      description: "It broke.",
      topic_id: "topic-1",
      severity: "high",
      browser_metadata: null,
    });
  });

  it("listFeedbackTopics maps to list_feedback_topics", async () => {
    const { client, rpc } = stubClient([]);
    await listFeedbackTopics(client, "forum");
    expect(rpc).toHaveBeenCalledWith("list_feedback_topics", {
      app_slug: "forum",
    });
  });

  it("myReports treats an omitted app as every app", async () => {
    const { client, rpc } = stubClient([]);
    await myReports(client);
    expect(rpc).toHaveBeenCalledWith("my_reports", { app_slug: null });
  });

  it("reportOutcomes serialises `since` as an ISO string", async () => {
    const { client, rpc } = stubClient([]);
    const since = new Date("2026-01-02T03:04:05.000Z");
    await reportOutcomes(client, { app: "forum", since });
    expect(rpc).toHaveBeenCalledWith("report_outcomes", {
      app_slug: "forum",
      since: "2026-01-02T03:04:05.000Z",
    });
  });
});

describe("error handling", () => {
  it("throws when the RPC raises, rather than returning undefined", async () => {
    // PostgREST reports a raised exception as a *resolved* promise carrying an
    // error, so a caller who forgets to check it would otherwise see undefined
    // and carry on as though the report had been filed.
    const { client } = stubClient(null, {
      message: "Suspended accounts cannot file reports",
    });

    await expect(
      fileReport(client, {
        app: "forum",
        contentType: "resource",
        contentRef: "abc",
        reasonId: "reason-1",
      }),
    ).rejects.toThrow(/Suspended accounts cannot file reports/);
  });

  it("names the function that failed", async () => {
    const { client } = stubClient(null, { message: "nope" });
    await expect(listReportReasons(client, "forum")).rejects.toThrow(
      /platform\.list_report_reasons\(\)/,
    );
  });
});
