/** Carried over from the platform's `server/export/csv.test.ts` with the writer. */
import { describe, expect, it } from "vitest";
import { csvField, csvRow, csvTimestamp } from "./write.js";

describe("csvField", () => {
  it("leaves an ordinary value unquoted", () => {
    // Quoting everything is also valid RFC 4180, and is what most hand-rolled
    // serializers do. Not quoting keeps the file readable in a terminal, which
    // is where somebody debugging an import will open it.
    expect(csvField("Sam Rivera")).toBe("Sam Rivera");
  });

  it("quotes on each of the four RFC 4180 triggers", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
    expect(csvField("line\rbreak")).toBe('"line\rbreak"');
  });

  it("renders null and undefined as empty, never as words", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("renders booleans as true/false", () => {
    expect(csvField(true)).toBe("true");
    expect(csvField(false)).toBe("false");
  });

  it("neutralises a spreadsheet formula in a team name", () => {
    // A member can name their team this. The tab is invisible in a cell and
    // stops the formula executing on open.
    // Not quoted: a tab is an ordinary character in a comma-delimited file,
    // and none of the four RFC 4180 triggers is present.
    expect(csvField("=cmd|'/c calc'!A1")).toBe("\t=cmd|'/c calc'!A1");
    expect(csvField("+1")).toBe("\t+1");
    expect(csvField("-1")).toBe("\t-1");
    expect(csvField("@here")).toBe("\t@here");
  });

  it("does not mangle a leading minus inside a normal value", () => {
    expect(csvField("well-known")).toBe("well-known");
  });

  it("renders a Date as an offset timestamp, not a bare local time", () => {
    // A projection returns `unknown[]`, so nothing stops a caller handing a
    // Date straight over instead of routing it through csvTimestamp.
    // A bare `String(date)` writes "Fri Apr 10 2026 18:00:00 GMT-0400 (...)",
    // which is the exact thing csvTimestamp exists to keep out of a spreadsheet
    // opened in another zone.
    expect(csvField(new Date("2026-04-10T18:00:00-04:00"))).toBe(
      "2026-04-10T22:00:00.000Z",
    );
  });

  it("never writes [object Object]", () => {
    // The silent failure: "[object Object]" is a valid CSV cell that has
    // dropped the data, in a file nobody re-reads until an import has already
    // gone wrong. JSON is lossy for some shapes but always legible, so a
    // reviewer opening the file can see the projection is at fault.
    expect(csvField({ name: "Sam" })).toBe('"{""name"":""Sam""}"');
    expect(csvField([1, 2])).toBe('"[1,2]"');
  });
});

describe("csvRow", () => {
  it("joins with commas and ends CRLF", () => {
    expect(csvRow(["a", 1, true, null])).toBe("a,1,true,\r\n");
  });
});

describe("csvTimestamp", () => {
  it("emits ISO 8601 with an explicit offset", () => {
    // Never a bare local time: for a club whose meetings all start at 18:00
    // Eastern, an offsetless timestamp shows the wrong evening in another zone.
    expect(csvTimestamp(new Date("2026-04-10T18:00:00-04:00"))).toBe(
      "2026-04-10T22:00:00.000Z",
    );
  });

  it("renders null and an unparseable string as empty", () => {
    expect(csvTimestamp(null)).toBe("");
    expect(csvTimestamp("not a date")).toBe("");
  });
});
