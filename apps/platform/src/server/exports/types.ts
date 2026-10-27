import type {
  ExportFilters,
  ExportKind,
  Row,
} from "@devdogsuga/events/exports";

/** The database, as an export uses it. */
export interface ExportDeps {
  /** Writes the audit row; returns its id. Throws if it cannot. */
  audit: (
    userId: string,
    kind: ExportKind,
    filters: Record<string, string>,
  ) => Promise<string>;
  /** The export's rows, transform applied. */
  rows: (kind: ExportKind, filters: ExportFilters) => Promise<Row[]>;
  finish: (auditId: string, rowCount: number) => Promise<void>;
  /** The slug that names the files; null when there is no such meeting. */
  meetingSlug: (meetingId: string) => Promise<string | null>;
}
