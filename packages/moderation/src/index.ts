/**
 * Typed wrappers over the DevDogs reporting and feedback RPCs.
 *
 * This package is sugar, not the interface. The contract is the set of
 * `platform` functions these call plus the RLS around them, reached through
 * PostgREST — the Flutter app calls exactly the same functions with the same
 * arguments and gets the same JSON, with no package and no generated models.
 * If something here disagrees with the SQL, the SQL is right.
 *
 * Every function takes the app's own supabase-js client and hops to the
 * `platform` schema internally:
 *
 * ```ts
 * import { fileReport, listReportReasons } from "@devdogsuga/moderation";
 *
 * const reasons = await listReportReasons(supabase, "forum");
 * await fileReport(supabase, {
 *   app: "forum",
 *   contentType: "resource",
 *   contentRef: resource.id,
 *   reasonId: selected.id,
 * });
 * ```
 */
import { callRpc, type ModerationClient } from "./client.js";
import type {
  FeedbackTopic,
  FileReportParams,
  FileReportResult,
  MyReport,
  ReportReason,
  SubmitFeedbackParams,
  SubmitFeedbackResult,
} from "./types.js";

export type { ModerationClient } from "./client.js";
export type {
  BrowserMetadata,
  FeedbackSeverity,
  FeedbackTopic,
  FeedbackType,
  FileReportParams,
  FileReportResult,
  MyReport,
  ReportOutcome,
  ReportReason,
  SubmitFeedbackParams,
  SubmitFeedbackResult,
} from "./types.js";

/**
 * The reasons a user may select when reporting content in `app`.
 *
 * Runs as the caller, so it returns what that user is allowed to see — an
 * anonymous visitor gets an empty list, and so does an OAuth test identity.
 */
export async function listReportReasons(
  client: ModerationClient,
  app: string,
): Promise<ReportReason[]> {
  return callRpc<ReportReason[]>(client, "list_report_reasons", {
    app_slug: app,
  });
}

/** The topics a user may select when submitting feedback about `app`. */
export async function listFeedbackTopics(
  client: ModerationClient,
  app: string,
): Promise<FeedbackTopic[]> {
  return callRpc<FeedbackTopic[]>(client, "list_feedback_topics", {
    app_slug: app,
  });
}

/**
 * Files a report against a piece of content.
 *
 * Note what you do *not* pass: who authored the content, and what it said. Both
 * are read from the content itself inside the RPC, so a client cannot attribute
 * content to the wrong user or hand moderators fabricated evidence. The
 * snapshot is frozen at this moment, so a moderator reviews what was actually
 * reported even if the content is edited or deleted afterwards.
 *
 * Throws if the content does not exist, if the reason belongs to a different
 * app, if the caller is suspended, or if they have filed too many reports in
 * the last hour.
 */
export async function fileReport(
  client: ModerationClient,
  params: FileReportParams,
): Promise<FileReportResult> {
  return callRpc<FileReportResult>(client, "file_report", {
    app_slug: params.app,
    content_type: params.contentType,
    content_ref: params.contentRef,
    reason_id: params.reasonId,
    description: params.description ?? null,
  });
}

/** Submits feedback about `app`. Throws if the caller is suspended. */
export async function submitFeedback(
  client: ModerationClient,
  params: SubmitFeedbackParams,
): Promise<SubmitFeedbackResult> {
  return callRpc<SubmitFeedbackResult>(client, "submit_feedback", {
    app_slug: params.app,
    feedback_type: params.type,
    title: params.title,
    description: params.description,
    topic_id: params.topicId ?? null,
    severity: params.severity ?? null,
    browser_metadata: params.browserMetadata ?? null,
  });
}

/**
 * The caller's own reports, newest first. Optionally narrowed to one app.
 */
export async function myReports(
  client: ModerationClient,
  app?: string,
): Promise<MyReport[]> {
  return callRpc<MyReport[]>(client, "my_reports", { app_slug: app ?? null });
}

/**
 * The decided subset of {@link myReports} — for showing a reporter that
 * something happened without listing everything they have ever filed.
 *
 * `since` makes polling cheap: pass the timestamp of the last outcome you
 * showed them and you get only what has been decided since.
 */
export async function reportOutcomes(
  client: ModerationClient,
  options: { app?: string; since?: Date | string } = {},
): Promise<MyReport[]> {
  const since =
    options.since instanceof Date ? options.since.toISOString() : options.since;
  return callRpc<MyReport[]>(client, "report_outcomes", {
    app_slug: options.app ?? null,
    since: since ?? null,
  });
}
