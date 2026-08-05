import { describe, expect, it } from "vitest";
import type { AirtableRecord } from "./client.js";
import { field, table } from "./field.js";
import { buildPush, mergeOn } from "./push.js";

interface Member {
  userId: string;
  ugaEmail: string | null;
  legalName: string | null;
  meetingCount: number;
}

const members = table("Members", "tblM", {
  platformId: field
    .text("fldId", "⚙️ Platform ID")
    .matchKey()
    .push((m: Member) => m.userId),
  ugaEmail: field
    .email("fldEmail", "UGA email")
    .push((m: Member) => m.ugaEmail),
  legalName: field
    .text("fldName", "Legal name")
    .push((m: Member) => m.legalName),
  meetings: field
    .number("fldCount", "⚙️ Meetings attended")
    .push((m: Member) => m.meetingCount),
  dues: field.date("fldDues", "Dues paid").pull((v) => v),
});

const member = (over: Partial<Member> = {}): Member => ({
  userId: "u1",
  ugaEmail: "abc123@uga.edu",
  legalName: "Ada Lovelace",
  meetingCount: 3,
  ...over,
});

const record = (fields: Record<string, unknown>): AirtableRecord => ({
  id: "rec1",
  fields: fields as AirtableRecord["fields"],
});

describe("buildPush", () => {
  it("keys the payload by field ID, never by name", () => {
    // Field names are editable by anyone with base access. An officer tidying
    // "UGA email" to "UGA Email" would silently break a name-keyed push.
    const plan = buildPush(members, [member()], []);
    expect(Object.keys(plan.records[0]!.fields).sort()).toEqual([
      "fldCount",
      "fldEmail",
      "fldId",
      "fldName",
    ]);
  });

  it("only includes pushed fields, never pulled ones", () => {
    const plan = buildPush(members, [member()], []);
    expect(plan.records[0]!.fields).not.toHaveProperty("fldDues");
  });

  it("skips records whose mapped values are unchanged", () => {
    // A sync that rewrites identical values burns the shared call allowance
    // and makes every record look freshly modified, which destroys "sort by
    // last modified" as a way to find what an officer actually touched.
    const existing = [
      record({
        fldId: "u1",
        fldEmail: "abc123@uga.edu",
        fldName: "Ada Lovelace",
        fldCount: 3,
      }),
    ];
    const plan = buildPush(members, [member()], existing);
    expect(plan.records).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("writes a record whose value actually moved", () => {
    const existing = [
      record({
        fldId: "u1",
        fldEmail: "abc123@uga.edu",
        fldName: "Ada Lovelace",
        fldCount: 2,
      }),
    ];
    const plan = buildPush(members, [member({ meetingCount: 3 })], existing);
    expect(plan.records).toHaveLength(1);
    expect(plan.records[0]!.fields.fldCount).toBe(3);
  });

  it("treats an absent field and an empty value as the same state", () => {
    // Airtable omits empty fields from responses rather than returning null,
    // so without this every record with one empty field looks changed on every
    // pass, forever.
    const existing = [record({ fldId: "u1", fldCount: 0 })];
    const plan = buildPush(
      members,
      [member({ ugaEmail: null, legalName: null, meetingCount: 0 })],
      existing,
    );
    expect(plan.records).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  /**
   * The rule that justifies the whole two-column identity split. Null in
   * Postgres means "we have not learned this yet", never "it is empty", and
   * the two are indistinguishable once written.
   */
  it("never blanks an identity field that Airtable already holds", () => {
    const existing = [
      record({
        fldId: "u1",
        fldEmail: "abc123@uga.edu",
        fldName: "Ada Lovelace",
        fldCount: 3,
      }),
    ];
    // The member has dropped off the roster, so Postgres has nulled nothing
    // durable — but suppose it had.
    const plan = buildPush(
      members,
      [member({ ugaEmail: null, legalName: null, meetingCount: 4 })],
      existing,
    );

    expect(plan.records).toHaveLength(1);
    const fields = plan.records[0]!.fields;
    expect(fields).not.toHaveProperty("fldEmail");
    expect(fields).not.toHaveProperty("fldName");
    expect(fields.fldCount).toBe(4);
    expect(plan.omittedBlanks).toBe(2);
  });

  it("creates a record that does not exist yet", () => {
    const plan = buildPush(members, [member()], []);
    expect(plan.records).toHaveLength(1);
    expect(plan.unchanged).toBe(0);
  });

  it("refuses a row with no match key rather than duplicating it", () => {
    // Without the key Airtable has nothing to merge on and would create a new
    // record on every single pass.
    const plan = buildPush(members, [member({ userId: "" })], []);
    expect(plan.records).toHaveLength(0);
  });

  it("names the match key field for fieldsToMergeOn", () => {
    expect(mergeOn(members)).toEqual(["fldId"]);
  });
});
