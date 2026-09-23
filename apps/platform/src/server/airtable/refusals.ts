/**
 * The rules that make this a sync rather than a mirror.
 *
 * Meetings, workshops, projects and competitions lost this file's rules one
 * migration at a time: the first three moved to config-as-code, validated by
 * its own CI check before anything reaches Postgres; competitions moved to
 * the GitHub Projects mirror (`server/github/competitions.ts`), which reports
 * its own drift straight to Sentry rather than through this refusal channel.
 * The one Airtable-authored thing left is the reflection-policy singleton,
 * so this file is now scoped to it.
 *
 * Pure on purpose. Each rule takes the facts it needs and returns a reason,
 * with no database and no Airtable client anywhere near it, because these are
 * the rules that most need a test each and the least need a fixture base to
 * test against.
 */

/** What the sync refused, and why, in words an officer can act on. */
export interface Refusal {
  table: "platformSettings";
  airtableRecordId: string;
  /** Machine-readable, for the console and for tests. */
  code: RefusalCode;
  /** Written verbatim into the record's `Sync status` field. */
  message: string;
}

export type RefusalCode =
  // Not a refusal: no rule rejected anything, the write itself failed. The
  // backstop for a bad value no rule here has learned to name yet.
  "row_write_failed" | "reflection_settings_invalid";
