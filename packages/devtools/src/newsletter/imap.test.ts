import { describe, expect, it } from "vitest";
import { draftsFromList, quoteMailbox, xoauth2 } from "./imap.js";

describe("xoauth2", () => {
  it("frames user and bearer token the way RFC 7628 wants", () => {
    const decoded = Buffer.from(
      xoauth2("devdogs@uga.edu", "TOKEN"),
      "base64",
    ).toString("utf8");
    expect(decoded).toBe("user=devdogs@uga.edu\x01auth=Bearer TOKEN\x01\x01");
  });
});

describe("draftsFromList", () => {
  it("finds the folder by attribute, not by name", () => {
    expect(
      draftsFromList([
        '* LIST (\\HasNoChildren) "/" INBOX',
        '* LIST (\\HasNoChildren \\Drafts) "/" Brouillons',
        '* LIST (\\HasNoChildren \\Sent) "/" "Sent Items"',
      ]),
    ).toBe("Brouillons");
  });

  it("unquotes a name that needed quoting", () => {
    expect(draftsFromList(['* LIST (\\Drafts) "/" "My \\"Drafts\\""'])).toBe(
      'My "Drafts"',
    );
  });

  it("returns null when nothing carries the attribute", () => {
    expect(draftsFromList(['* LIST (\\HasNoChildren) "/" INBOX'])).toBeNull();
  });
});

describe("quoteMailbox", () => {
  it("escapes quotes and backslashes on the way back out", () => {
    expect(quoteMailbox('My "Drafts"')).toBe('"My \\"Drafts\\""');
    expect(quoteMailbox("Drafts")).toBe('"Drafts"');
  });
});
