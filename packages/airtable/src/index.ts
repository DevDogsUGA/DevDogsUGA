export {
  field,
  table,
  pushFields,
  pullFields,
  platformOwnedFields,
  statusField,
  matchKeyField,
  isMergeEligible,
  MERGE_ELIGIBLE_TYPES,
  UndirectedField,
  type AirtableValue,
  type Direction,
  type FieldSpec,
  type FieldType,
  type IgnoredField,
  type MergeEligibleType,
  type PullField,
  type PushField,
  type StatusField,
  type TableSpec,
} from "./field.js";

export {
  AirtableClient,
  AirtableError,
  BATCH_SIZE,
  type AirtableClientOptions,
  type AirtableRecord,
  type BaseSchema,
  type LiveField,
  type LiveTable,
  type NewField,
} from "./client.js";

export {
  scaffoldBase,
  discoverIds,
  createOptionsFor,
  planScaffold,
  undeclaredFields,
  type ScaffoldAction,
  type ScaffoldPlan,
  type ScaffoldResult,
  type UndeclaredField,
} from "./scaffold.js";

export {
  applyDiscoveredIds,
  type ApplyIdsResult,
  type DiscoveredIds,
} from "./ids.js";

export {
  registry,
  BASE_ID,
  isPlaceholder,
  MEETING_BUILDING_CHOICES,
  MEETING_CANCELLATION_REASON_MAX_LENGTH,
  MEETING_KIND_CHOICES,
  MEETING_NAME_OVERRIDE_MAX_LENGTH,
  MEETING_SUMMARY_MAX_LENGTH,
  RSVP_URL_ALLOWED_HOSTS,
  WORKSHOP_DESCRIPTION_MAX_LENGTH,
  WORKSHOP_TITLE_MAX_LENGTH,
  normalizeMeetingSummary,
  parseAirtableDateTime,
  parseAttendanceFormUrl,
  parseMeetingBuilding,
  parseMeetingKind,
  parseRsvpUrl,
  type MeetingBuilding,
  type MeetingKind,
  members,
  projects,
  meetings,
  workshops,
  competitions,
  teamsTable,
  attendanceTable,
  todo,
  todoTable,
  type AttendanceRow,
  type CompetitionRow,
  type MeetingRow,
  type MemberRow,
  type ProjectRow,
  type RegistryTable,
  type TeamRow,
  type WorkshopRow,
} from "./registry.js";

export {
  buildPush,
  buildUpdate,
  mergeOn,
  type PushPlan,
  type UpdatePlan,
} from "./push.js";
export { applyPull, type PullResult } from "./pull.js";

export {
  verifyBase,
  choiceFindings,
  duplicateKeyFindings,
  formatVerifyResult,
  type Finding,
  type Severity,
  type VerifyResult,
} from "./verify.js";

export {
  normalize,
  readSnapshot,
  snapshotDrift,
  snapshotPath,
  writeSnapshot,
  SnapshotMissingError,
  type SchemaSnapshot,
  type SnapshotDrift,
} from "./snapshot.js";
