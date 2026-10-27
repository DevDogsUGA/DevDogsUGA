import { describe, expect, it } from "vitest";
import { guessHeaderRow } from "./csv.js";
import { MissingColumnsError } from "./errors.js";
import { parseRoster, RosterFormatError } from "./roster.js";

/** The real export's shape: a preamble, CRLF, `(Hidden)` columns, one row per position. */
const EXPORT = [
  "Organization Roster",
  "",
  "DevDogs,9/28/2026",
  'Username,Card ID Number,"First Name","Last Name","Campus Email","Preferred Email","Organization Name","Position Name"',
  '(Hidden),(Hidden),"Ada","Lovelace","AL12345@uga.edu","(Hidden)","DevDogs","Member"',
  '(Hidden),(Hidden),"Ada","Lovelace","al12345@uga.edu","(Hidden)","DevDogs","President"',
  '(Hidden),(Hidden),"Alan","Turing","at67890@uga.edu","(Hidden)","DevDogs","Member"',
  '(Hidden),(Hidden),"","NoFirst","nf00000@uga.edu","(Hidden)","DevDogs","Member"',
  "",
].join("\r\n");

describe("parseRoster", () => {
  it("finds the header past the preamble and merges a person's positions", () => {
    const roster = parseRoster(EXPORT);
    expect(roster.members).toEqual([
      {
        email: "al12345@uga.edu",
        firstName: "Ada",
        lastName: "Lovelace",
        positions: ["Member", "President"],
      },
      {
        email: "at67890@uga.edu",
        firstName: "Alan",
        lastName: "Turing",
        positions: ["Member"],
      },
    ]);
    expect(roster.organizations).toEqual(["DevDogs"]);
    expect(roster.skippedLines).toEqual([8]);
    expect(roster.conflictingNames).toEqual([]);
  });

  it("accepts the old plain First Name, Last Name, Email layout", () => {
    const roster = parseRoster(
      "First Name,Last Name,Email\nAda,Lovelace,a@uga.edu\n",
    );
    expect(roster.members.map((m) => m.email)).toEqual(["a@uga.edu"]);
    expect(roster.organizations).toEqual([]);
  });

  it("reports an email listed under two names, keeping the first", () => {
    const roster = parseRoster(
      "First Name,Last Name,Email\nAda,Lovelace,a@uga.edu\nAugusta,King,a@uga.edu\n",
    );
    expect(roster.members[0]!.firstName).toBe("Ada");
    expect(roster.conflictingNames).toEqual(["a@uga.edu"]);
  });

  it("refuses a file with no recognizable header", () => {
    expect(() => parseRoster("Organization Roster\r\n\r\nfoo,bar\r\n")).toThrow(
      RosterFormatError,
    );
  });

  it("is a MissingColumnsError, so a caller can offer a column picker", () => {
    expect(() => parseRoster("foo,bar\n1,2\n")).toThrow(MissingColumnsError);
  });

  it("reads the columns it is told to, and names the header it used", () => {
    const text = "Given,Family,Mail\nAda,Lovelace,a@uga.edu\n";
    const roster = parseRoster(text, {
      columns: { firstName: "given", lastName: "FAMILY", email: "Mail" },
    });
    expect(roster.members.map((m) => m.email)).toEqual(["a@uga.edu"]);
    expect(roster.columns).toEqual({
      firstName: "Given",
      lastName: "Family",
      email: "Mail",
    });
    expect(roster.headers).toEqual(["Given", "Family", "Mail"]);
    expect(() => parseRoster(text, { columns: { email: "Nope" } })).toThrow(
      RosterFormatError,
    );
  });

  it("with ugaOnly, moves other domains to notUga with their lines", () => {
    const roster = parseRoster(
      "First Name,Last Name,Email\nAda,Lovelace,a@uga.edu\nAlan,Turing,at@example.com\n",
      { ugaOnly: true },
    );
    expect(roster.members.map((m) => m.email)).toEqual(["a@uga.edu"]);
    expect(roster.notUga).toEqual([{ email: "at@example.com", line: 3 }]);
  });
});

describe("guessHeaderRow", () => {
  it("picks the widest of the first rows", () => {
    expect(guessHeaderRow("Title\n\nA,B,C\n1,2,3\n")).toEqual(["A", "B", "C"]);
  });
});
