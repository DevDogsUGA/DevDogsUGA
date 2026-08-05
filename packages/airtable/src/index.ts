export {
  field,
  table,
  pushFields,
  pullFields,
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
  type TableSpec,
} from "./field.js";

export {
  AirtableClient,
  AirtableError,
  BATCH_SIZE,
  type AirtableClientOptions,
  type AirtableRecord,
} from "./client.js";

export {
  registry,
  isPlaceholder,
  members,
  projects,
  meetings,
  workshops,
  competitions,
  teamsTable,
  type CompetitionRow,
  type MeetingRow,
  type MemberRow,
  type ProjectRow,
  type RegistryTable,
  type TeamRow,
  type WorkshopRow,
} from "./registry.js";

export { buildPush, mergeOn, type PushPlan } from "./push.js";
export { applyPull, type PullResult } from "./pull.js";

export {
  verifyBase,
  duplicateKeyFindings,
  formatVerifyResult,
  type Finding,
  type Severity,
  type VerifyResult,
} from "./verify.js";
