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

/**
 * Browser/device context collected at submission time, for debugging.
 *
 * A `type` rather than an `interface` so it satisfies the generated `Json`
 * parameter of `submit_feedback`: interfaces have no implicit index signature,
 * so an otherwise-identical interface is rejected where a type alias is not.
 */
export type BrowserMetadata = {
  userAgent: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  url: string;
};

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
