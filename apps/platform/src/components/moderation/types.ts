import type { Database } from "@devdogsuga/supabase";

/**
 * A report reason, as `platform."reportReason"` defines it.
 *
 * Derived from the generated database types rather than restated, so a label
 * added to the enum reaches this union the next time types are regenerated and
 * a typo fails to compile. There is no per-app or per-content-type list: one
 * global vocabulary, ordered by the `position` column behind
 * `list_report_reasons()`.
 */
export type ReportReasonValue = Database["platform"]["Enums"]["reportReason"];

/** One selectable reason on a report form, from `list_report_reasons()`. */
export interface ReportReason {
  reason: ReportReasonValue;
  title: string;
  description: string | null;
}
