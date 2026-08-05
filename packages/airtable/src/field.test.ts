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
   * The highest-value property in the registry, and the one that must never
   * run: a field both sides write produces no runtime error. It produces
   * last-writer-wins, silently, weeks later — and the losing write is
   * somebody's dues record.
   *
   * Asserted at the type level. `.push()` returns a `PushField`, which carries
   * no `.pull()` method, so the mistake cannot be spelled.
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
   * select and date. `email` is not on that list — which is why the Members
   * match key is a Platform ID and not the UGA email it would otherwise
   * obviously be.
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
