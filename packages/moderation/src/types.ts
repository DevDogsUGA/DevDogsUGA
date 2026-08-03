/** Category of a feedback submission. Mirrors `platform."feedbackType"`. */
export type FeedbackType =
  | "bug_report"
  | "feature_request"
  | "design_feedback"
  | "performance"
  | "content_issue"
  | "other";

/** Mirrors `platform."feedbackSeverity"`. */
export type FeedbackSeverity = "low" | "medium" | "high";

/** Browser/device context collected at submission time, for debugging. */
export interface BrowserMetadata {
  userAgent: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  url: string;
}

/** One selectable reason on a report form, from `list_report_reasons`. */
export interface ReportReason {
  id: string;
  title: string;
  description: string | null;
}

/** One selectable topic on a feedback form, from `list_feedback_topics`. */
export interface FeedbackTopic {
  id: string;
  label: string;
}

export interface FileReportParams {
  /**
   * The app's slug in `platform."apps"` — e.g. `"forum"`. Not an OAuth client
   * id: which app this is and which OAuth client signed the user in are
   * deliberately separate questions now.
   */
  app: string;
  /**
   * The content type, as `list_content_types` reports it. Usually the table
   * name, unless the app overrode it in `platform."contentTypes"`.
   */
  contentType: string;
  /** The content row's primary key, stringified. */
  contentRef: string;
  /** An id from `listReportReasons(client, app)`. */
  reasonId: string;
  /** Optional free text from the reporter. Truncated to 1000 characters. */
  description?: string;
}

export interface FileReportResult {
  reportId: string;
  /**
   * True when this content already had an open report and the caller was
   * recorded as corroborating it rather than queueing a duplicate. Worth
   * surfacing: "someone already reported this, and we've noted you agree"
   * reads very differently from "thanks, we'll take a look".
   */
  corroborated: boolean;
}

export interface SubmitFeedbackParams {
  /** The app's slug in `platform."apps"`. */
  app: string;
  type: FeedbackType;
  /** An id from `listFeedbackTopics(client, app)`. Optional. */
  topicId?: string;
  severity?: FeedbackSeverity;
  /** Short summary. Truncated to 100 characters. */
  title: string;
  /** Full description. */
  description: string;
  browserMetadata?: BrowserMetadata;
}

export interface SubmitFeedbackResult {
  feedbackId: string;
}

/**
 * What a reporter is told about their own report.
 *
 * Deliberately coarse. A reporter learns whether their report led to action,
 * never what happened to the other user — another member's standing is not the
 * reporter's business, and the moderation console has the full record for
 * anyone entitled to it.
 */
export type ReportOutcome =
  | "dismissed"
  | "action_taken"
  | "no_violation"
  | null;

export interface MyReport {
  reportId: string;
  appSlug: string;
  contentType: string;
  contentRef: string;
  contentUrl: string | null;
  /**
   * What was reported, frozen at filing time. Null unless the content type is
   * marked `public` in `platform."contentTypes"` — visibility defaults closed
   * so that reporting can never become a disclosure oracle for private content.
   */
  snapshot: string | null;
  reason: string;
  description: string | null;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  resolvedAt: string | null;
  outcome: ReportOutcome;
  /** Whether the reported content was hidden as a result. */
  contentRemoved: boolean;
}
