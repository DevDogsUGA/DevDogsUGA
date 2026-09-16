import { describe, expect, it } from "vitest";
import { dotStuff, endsReply, originationHeaders } from "./smtp.js";

describe("originationHeaders", () => {
  it("stamps From, To and an RFC 5322 date ahead of the draft headers", () => {
    const headers = originationHeaders(
      "devdogs@uga.edu",
      ["a@uga.edu", "b@uga.edu"],
      new Date(Date.UTC(2026, 8, 11, 6, 15, 23)),
    );
    expect(headers).toBe(
      "From: <devdogs@uga.edu>\r\n" +
        "To: <a@uga.edu>, <b@uga.edu>\r\n" +
        "Date: Fri, 11 Sep 2026 06:15:23 +0000\r\n",
    );
  });
});

describe("dotStuff", () => {
  it("doubles a dot that starts a line, and only there", () => {
    expect(dotStuff(".leading\r\nmiddle.dot\r\n.again\r\n")).toBe(
      "..leading\r\nmiddle.dot\r\n..again\r\n",
    );
  });

  it("leaves a message with no line-leading dots alone", () => {
    const message = "Subject: v3.0.1\r\n\r\nbase64==\r\n";
    expect(dotStuff(message)).toBe(message);
  });
});

describe("endsReply", () => {
  it("splits final reply lines from continuations", () => {
    expect(endsReply("250 OK")).toBe(true);
    expect(endsReply("250")).toBe(true);
    expect(endsReply("250-smtp.office365.com Hello")).toBe(false);
    expect(endsReply("354 Start mail input")).toBe(true);
  });
});
