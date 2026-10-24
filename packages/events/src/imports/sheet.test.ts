import { ImportInputError, MissingColumnsError } from "./errors.js";
import { describe, expect, it } from "vitest";
import { parseSheet } from "./sheet.js";

describe("parseSheet", () => {
  it("reads a Google Forms response sheet", () => {
    const sheet = parseSheet(
      [
        "Timestamp,Email Address,What is your name?,Which workshop?",
        "9/9/2026 18:05:12,AB12345@uga.edu,Ada Lovelace,Web",
        "9/9/2026 18:06:40,someone@gmail.com,Al Turing,Mobile",
        "9/9/2026 18:07:01,ab12345@uga.edu,Ada Lovelace,Web",
        "9/9/2026 18:08:00,,Nobody,Web",
      ].join("\n"),
    );
    expect(sheet.emailColumn).toBe("Email Address");
    expect(sheet.nameColumn).toBe("What is your name?");
    expect(sheet.attendees).toEqual([
      { email: "ab12345@uga.edu", name: "Ada Lovelace", line: 2 },
    ]);
    expect(sheet.notUga).toEqual([{ email: "someone@gmail.com", line: 3 }]);
    expect(sheet.duplicates).toBe(1);
    expect(sheet.missingEmail).toEqual([5]);
  });

  it("prefers the email column holding UGA addresses (Microsoft Forms)", () => {
    const sheet = parseSheet(
      [
        "ID,Start time,Completion time,Email,Name,UGA email,First name,Last name",
        "1,9/9/26 18:01,9/9/26 18:02,anonymous,Anonymous,ab12345@uga.edu,Ada,Lovelace",
        "2,9/9/26 18:01,9/9/26 18:02,anonymous,Anonymous,cd67890@uga.edu,Alan,Turing",
      ].join("\r\n"),
    );
    expect(sheet.emailColumn).toBe("UGA email");
    expect(sheet.nameColumn).toBe("First name + Last name");
    expect(sheet.attendees.map((a) => [a.email, a.name])).toEqual([
      ["ab12345@uga.edu", "Ada Lovelace"],
      ["cd67890@uga.edu", "Alan Turing"],
    ]);
  });

  it("finds the header below a title and reads 'Name <email>' cells", () => {
    const sheet = parseSheet(
      [
        "Sept 9 build night,,",
        ",,",
        "Name,MyID email,Notes",
        'Ada,"Ada L <ab12345@uga.edu>",late',
      ].join("\n"),
    );
    expect(sheet.attendees).toEqual([
      { email: "ab12345@uga.edu", name: "Ada", line: 4 },
    ]);
  });

  it("reads every address from a sheet with no header", () => {
    const sheet = parseSheet("ab12345@uga.edu\ncd67890@uga.edu, x@gmail.com\n");
    expect(sheet.emailColumn).toBeNull();
    expect(sheet.attendees.map((a) => a.email)).toEqual([
      "ab12345@uga.edu",
      "cd67890@uga.edu",
    ]);
    expect(sheet.notUga.map((n) => n.email)).toEqual(["x@gmail.com"]);
  });

  it("takes the columns it is told to", () => {
    const sheet = parseSheet(
      "Email,Backup email,Who\nab@gmail.com,ab12345@uga.edu,Ada\n",
      { emailColumn: "backup EMAIL", nameColumn: "Who" },
    );
    expect(sheet.attendees).toEqual([
      { email: "ab12345@uga.edu", name: "Ada", line: 2 },
    ]);
  });

  it("names the columns there are when told one that is not", () => {
    expect(() =>
      parseSheet("Email,Name\nab12345@uga.edu,Ada\n", {
        nameColumn: "Full name",
      }),
    ).toThrow(ImportInputError);
  });

  it("reads no names when told the name column is none", () => {
    const sheet = parseSheet("Email,Name\nab12345@uga.edu,Ada\n", {
      nameColumn: null,
    });
    expect(sheet.attendees[0]!.name).toBeNull();
    expect(sheet.headers).toEqual(["Email", "Name"]);
  });

  it("raises MissingColumnsError when no column holds addresses", () => {
    expect(() => parseSheet("Name,Notes\nAda,hello\n")).toThrow(
      MissingColumnsError,
    );
  });
});
