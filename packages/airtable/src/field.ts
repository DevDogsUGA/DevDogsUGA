/**
 * The field builder.
 *
 * Everything the sync reads or writes is declared through these, which is what
 * makes "we may want to push something else later" a one-line change rather
 * than an archaeology exercise across the push, the pull and the verifier.
 */

/** The Airtable field types this integration uses. */
export type FieldType =
  | "singleLineText"
  | "multilineText"
  | "email"
  | "url"
  | "number"
  | "date"
  | "dateTime"
  | "checkbox"
  | "singleSelect"
  | "multipleSelects"
  | "multipleRecordLinks";

/**
 * The types Airtable's upsert will accept in `fieldsToMergeOn`.
 *
 * Quoting the API reference: "an array with at least one and at most three
 * field names or IDs. These cannot be computed fields (formulas, lookups,
 * rollups), and must be one of the following types: number, text, long text,
 * single select, multiple select, date."
 *
 * `email` is NOT on that list, which is why the match key is a
 * `singleLineText` Platform ID rather than the UGA email it would otherwise
 * obviously be. Encoding the list here makes an ineligible match key a compile
 * error instead of a write-time rejection.
 */
export type MergeEligibleType =
  | "singleLineText"
  | "multilineText"
  | "number"
  | "date"
  | "dateTime"
  | "singleSelect"
  | "multipleSelects";

export type AirtableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[];

export type Direction = "push" | "pull" | "ignore" | "status";

export interface FieldSpec<TType extends FieldType = FieldType> {
  /** `fldXXXXXXXXXXXXXX`. The wire format — never the human-readable name. */
  readonly id: string;
  readonly type: TType;
  /** What an officer will call it when they report a problem. */
  readonly name: string;
  readonly direction: Direction;
  readonly isMatchKey: boolean;
  /**
   * For `multipleRecordLinks` only: the registry key of the table this points
   * at.
   *
   * Required at the type level by `field.link`, because a link field without a
   * target is not a description of anything the scaffolder can create —
   * `linkedTableId` is a required option on the Meta API, and the target was
   * previously recoverable only by reading the field's NAME, which is the one
   * thing this integration treats as changeable.
   */
  readonly linkTo?: string;
  /** Present only when direction is "push". */
  readonly project?: (row: never) => AirtableValue;
  /** Present only when direction is "pull". */
  readonly parse?: (value: AirtableValue) => unknown;
}

/** A field that has chosen `.push()`. It has no `.pull()` to call. */
export interface PushField<
  TType extends FieldType,
  TRow,
> extends FieldSpec<TType> {
  readonly direction: "push";
  readonly project: (row: TRow) => AirtableValue;
}

/** A field that has chosen `.pull()`. It has no `.push()` to call. */
export interface PullField<
  TType extends FieldType,
  TOut,
> extends FieldSpec<TType> {
  readonly direction: "pull";
  readonly parse: (value: AirtableValue) => TOut;
}

export interface IgnoredField<
  TType extends FieldType,
> extends FieldSpec<TType> {
  readonly direction: "ignore";
}

/**
 * A platform-owned message channel, written outside the push engine.
 *
 * Exists for exactly one field — `Sync status` — and it is worth its own
 * direction because it breaks the engine's never-blank rule on purpose.
 *
 * Every pushed field is a projection of Postgres state, and for those, null
 * means "we have not learned this yet" and must never be written as empty. A
 * refusal message is not a projection: when the officer fixes the row, the
 * message has to be CLEARED, and a stale refusal left sitting in the grid
 * reads as a live problem forever.
 *
 * So it stays declared here — the verifier still requires the field to exist
 * and still lists it for editing lockdown, and it is still single-writer — but
 * the sync writes it directly rather than through `buildPush`.
 */
export interface StatusField<TType extends FieldType> extends FieldSpec<TType> {
  readonly direction: "status";
}

/**
 * A field that has not yet declared a direction.
 *
 * `.push()` and `.pull()` return different types, neither of which carries the
 * other method — so a field declared with both fails to COMPILE rather than
 * being caught at runtime. That turns the rule the whole integration rests on
 * (never create a field both sides write) from a convention somebody has to
 * remember into a type error.
 *
 * It is the highest-value thing in this design, because a second writer
 * produces no error at runtime. It produces last-writer-wins, silently, weeks
 * later, and the losing write is somebody's dues record.
 */
export class UndirectedField<TType extends FieldType> {
  constructor(
    readonly id: string,
    readonly type: TType,
    readonly name: string,
    readonly isMatchKey: boolean = false,
    readonly linkTo?: string,
  ) {}

  /**
   * Marks this field as the upsert match key.
   *
   * The `this` parameter is the enforcement: calling `.matchKey()` on an
   * `email`, `checkbox` or link field is a compile error, because Airtable
   * would reject it in `fieldsToMergeOn` at write time — which is a far worse
   * place to find out.
   */
  matchKey(
    this: UndirectedField<MergeEligibleType & TType>,
  ): UndirectedField<TType> {
    return new UndirectedField(
      this.id,
      this.type,
      this.name,
      true,
      this.linkTo,
    );
  }

  push<TRow>(project: (row: TRow) => AirtableValue): PushField<TType, TRow> {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      isMatchKey: this.isMatchKey,
      linkTo: this.linkTo,
      direction: "push",
      project,
    };
  }

  pull<TOut>(parse: (value: AirtableValue) => TOut): PullField<TType, TOut> {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      isMatchKey: this.isMatchKey,
      linkTo: this.linkTo,
      direction: "pull",
      parse,
    };
  }

  /**
   * Declares that the platform deliberately does not touch this field.
   *
   * Exists so an officer-authored column is recorded as untouched rather than
   * merely absent. "Does the sync know about Notes?" has two very different
   * answers — absent means nobody looked, `.ignore()` means somebody decided.
   */
  ignore(): IgnoredField<TType> {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      isMatchKey: this.isMatchKey,
      linkTo: this.linkTo,
      direction: "ignore",
    };
  }

  /** See {@link StatusField}. Platform-owned, written outside the engine. */
  status(): StatusField<TType> {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      isMatchKey: this.isMatchKey,
      linkTo: this.linkTo,
      direction: "status",
    };
  }
}

function make<TType extends FieldType>(type: TType) {
  return (id: string, name: string) => new UndirectedField(id, type, name);
}

export const field = {
  /** `singleLineText` — the only merge-key-eligible plain text type. */
  text: make("singleLineText"),
  longText: make("multilineText"),
  /** `email` — CANNOT be a merge key. */
  email: make("email"),
  url: make("url"),
  number: make("number"),
  date: make("date"),
  dateTime: make("dateTime"),
  checkbox: make("checkbox"),
  singleSelect: make("singleSelect"),
  multipleSelects: make("multipleSelects"),
  /**
   * A link, and the registry key of what it links to.
   *
   * The target is a required argument rather than an optional one because
   * `linkedTableId` is required by the Meta API, so a link field that does not
   * name its target cannot be scaffolded — and inferring it from the field's
   * name would make the sync depend on a name being stable, which is the exact
   * thing field IDs exist to stop mattering.
   */
  link: (id: string, name: string, linkTo: string) =>
    new UndirectedField(
      id,
      "multipleRecordLinks" as const,
      name,
      false,
      linkTo,
    ),
};

export interface TableSpec<
  TFields extends Record<string, FieldSpec> = Record<string, FieldSpec>,
> {
  /** Human-readable, for error messages and the scaffolder. */
  readonly name: string;
  /** `tblXXXXXXXXXXXXXX`. */
  readonly id: string;
  readonly fields: TFields;
}

export function table<TFields extends Record<string, FieldSpec>>(
  name: string,
  id: string,
  fields: TFields,
): TableSpec<TFields> {
  return { name, id, fields };
}

export function pushFields(spec: TableSpec): FieldSpec[] {
  return Object.values(spec.fields).filter((f) => f.direction === "push");
}

export function pullFields(spec: TableSpec): FieldSpec[] {
  return Object.values(spec.fields).filter((f) => f.direction === "pull");
}

/**
 * Every field the platform owns — pushed or status.
 *
 * This, not `pushFields`, is what the field-lockdown checklist reads: an
 * officer editing `Sync status` by hand is the same class of problem as
 * editing an attendance count, and both are prevented the same way.
 */
export function platformOwnedFields(spec: TableSpec): FieldSpec[] {
  return Object.values(spec.fields).filter(
    (f) => f.direction === "push" || f.direction === "status",
  );
}

/** The `Sync status` field for a table, when it declares one. */
export function statusField(spec: TableSpec): FieldSpec | null {
  return (
    Object.values(spec.fields).find((f) => f.direction === "status") ?? null
  );
}

/**
 * The single match key for a table.
 *
 * Throws rather than returning null: every table the engine upserts into must
 * have exactly one, and a table with none or several is a registry bug that
 * should surface at startup rather than on the first write.
 */
export function matchKeyField(spec: TableSpec): FieldSpec {
  const keys = Object.values(spec.fields).filter((f) => f.isMatchKey);
  if (keys.length !== 1) {
    throw new Error(
      `Table "${spec.name}" must declare exactly one .matchKey() field, found ${keys.length}`,
    );
  }
  return keys[0]!;
}

export const MERGE_ELIGIBLE_TYPES: readonly FieldType[] = [
  "singleLineText",
  "multilineText",
  "number",
  "date",
  "dateTime",
  "singleSelect",
  "multipleSelects",
];

export function isMergeEligible(type: FieldType): boolean {
  return MERGE_ELIGIBLE_TYPES.includes(type);
}
