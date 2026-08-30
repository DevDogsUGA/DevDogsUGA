import { describe, expect, expectTypeOf, it } from "vitest";
import {
  field,
  isMergeEligible,
  matchKeyField,
  pullFields,
  pushFields,
  table,
  type PullField,
  type PushField,
} from "./field.js";

describe("direction", () => {
  /**
   * A field both sides write produces no runtime error. It produces
   * last-writer-wins, silently, weeks later, and the losing write is somebody's
   * dues record. `.push()` returns a `PushField`, which has no `.pull()`, so
   * the mistake cannot be spelled.
   */
  it("makes push and pull mutually exclusive in the type", () => {
    const pushed = field.text("fld1", "Name").push((r: { a: string }) => r.a);
    const pulled = field.date("fld2", "When").pull((v) => v);

    expectTypeOf(pushed).toExtend<PushField<"singleLineText", { a: string }>>();
    expectTypeOf(pulled).toExtend<PullField<"dateTime" | "date", unknown>>();

    // @ts-expect-error a pushed field has no .pull() to call
    expectTypeOf(pushed).toHaveProperty("pull");
    // @ts-expect-error a pulled field has no .push() to call
    expectTypeOf(pulled).toHaveProperty("push");
  });

  it("requires a direction to be stated out loud", () => {
    // `.ignore()` exists so an officer-authored column is recorded as
    // untouched rather than merely absent. "Does the sync know about Notes?"
    // has two very different answers.
    const ignored = field.longText("fld3", "Notes").ignore();
    expect(ignored.direction).toBe("ignore");
  });

  it("separates push and pull fields on a table", () => {
    const spec = table("T", "tbl1", {
      key: field
        .text("fldK", "Key")
        .matchKey()
        .push((r: { id: string }) => r.id),
      out: field.number("fldO", "Count").push((r: { n: number }) => r.n),
      in: field.date("fldI", "Paid").pull((v) => v),
      untouched: field.longText("fldU", "Notes").ignore(),
    });

    expect(pushFields(spec).map((f) => f.id)).toEqual(["fldK", "fldO"]);
    expect(pullFields(spec).map((f) => f.id)).toEqual(["fldI"]);
  });
});

describe("matchKey", () => {
  /**
   * `fieldsToMergeOn` accepts only number, text, long text, single/multiple
   * select and date. `email` is not on that list, which is why the Members
   * match key is a Platform ID and not the UGA email.
   */
  it("rejects an ineligible type at compile time", () => {
    const eligible = field.text("fldA", "Platform ID").matchKey();
    expect(eligible.isMatchKey).toBe(true);

    // @ts-expect-error email is not accepted in fieldsToMergeOn
    field.email("fldB", "UGA email").matchKey();
    // @ts-expect-error a link field is not accepted either
    field.link("fldC", "Meeting").matchKey();
  });

  it("agrees with the runtime eligibility list", () => {
    expect(isMergeEligible("singleLineText")).toBe(true);
    expect(isMergeEligible("date")).toBe(true);
    expect(isMergeEligible("email")).toBe(false);
    expect(isMergeEligible("checkbox")).toBe(false);
    expect(isMergeEligible("multipleRecordLinks")).toBe(false);
  });

  it("insists on exactly one per table", () => {
    const none = table("T", "tbl", {
      a: field.text("f1", "A").push((r: { a: string }) => r.a),
    });
    expect(() => matchKeyField(none)).toThrow(/exactly one/);

    const two = table("T", "tbl", {
      a: field
        .text("f1", "A")
        .matchKey()
        .push((r: { a: string }) => r.a),
      b: field
        .text("f2", "B")
        .matchKey()
        .push((r: { b: string }) => r.b),
    });
    expect(() => matchKeyField(two)).toThrow(/exactly one/);
  });
});

/**
 * A closed choice list is the only part of a spec Airtable can enforce, and
 * only if the list survives from the declaration to the scaffolder. Every
 * direction method rebuilds the spec by hand rather than spreading it, so a new
 * property has to be carried through four places. A list dropped in whichever
 * one was missed scaffolds a select with NO choices, which accepts anything and
 * looks fine.
 */
describe("choices", () => {
  const KIND = ["Workshop", "Social", "Meeting"] as const;

  it("carries a declared list onto the spec", () => {
    const spec = field.singleSelect("fldK", "Kind", KIND).ignore();
    expect(spec.choices).toEqual(["Workshop", "Social", "Meeting"]);
  });

  it("leaves choices undefined when none are declared", () => {
    // Not an empty array: undeclared means "the officers own this
    // vocabulary", and `createOptionsFor` and `verify.ts` both branch on the
    // difference.
    expect(field.singleSelect("fldK", "Kind").ignore().choices).toBeUndefined();
    expect(field.text("fldT", "Name").ignore().choices).toBeUndefined();
  });

  it("survives every direction method, and .matchKey() before them", () => {
    const undirected = field.singleSelect("fldK", "Kind", KIND);

    expect(undirected.push((r: { k: string }) => r.k).choices).toEqual(KIND);
    expect(undirected.pull((v) => v).choices).toEqual(KIND);
    expect(undirected.ignore().choices).toEqual(KIND);
    expect(undirected.status().choices).toEqual(KIND);

    // `.matchKey()` returns a new UndirectedField, so it is the one place the
    // list can be lost before a direction is even chosen. singleSelect is
    // merge-eligible, so this is a legal chain rather than a contrived one.
    const keyed = undirected.matchKey();
    expect(keyed.choices).toEqual(KIND);
    expect(keyed.ignore().choices).toEqual(KIND);
    expect(keyed.ignore().isMatchKey).toBe(true);
  });

  it("treats multipleSelects the same way", () => {
    // The two types take identical options at creation and differ only in
    // cardinality, so a list allowed on one and not the other would be a
    // distinction with no cause.
    const spec = field.multipleSelects("fldT", "Tracks", KIND).ignore();
    expect(spec.type).toBe("multipleSelects");
    expect(spec.choices).toEqual(KIND);
  });

  it("accepts a readonly array declared as const at the call site", () => {
    // `as const` gives a `readonly string[]`, which a `string[]` parameter
    // would reject, so this is a compile-time assertion in a runtime test.
    const choices = ["Workshop", "Social"] as const;
    expect(
      field.singleSelect("fldK", "Kind", choices).ignore().choices,
    ).toEqual(choices);
  });
});
