import { describe, expect, it } from "vitest";
import { buildEml } from "./eml.js";

const IMAGE = {
  cid: "devdogs-lockup@changelog.devdogsuga.org",
  filename: "devdogs-lockup@2x.png",
  contentType: "image/png",
  // A real 1x1 transparent PNG, so decoding the part back is meaningful.
  base64:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
};

function build(overrides: Partial<Parameters<typeof buildEml>[0]> = {}) {
  return buildEml({
    subject: "DevDogs Changelog v3.0.0: initial release",
    html: "<p>hello</p>",
    images: [IMAGE],
    boundary: "=_test-boundary",
    ...overrides,
  });
}

describe("buildEml", () => {
  it("opens as an unsent draft with the subject in the headers", () => {
    const eml = build();
    const headers = eml.split("\r\n\r\n")[0]!;
    expect(headers).toContain("X-Unsent: 1");
    expect(headers).toContain("MIME-Version: 1.0");
    expect(headers).toContain(
      "Subject: DevDogs Changelog v3.0.0: initial release",
    );
    expect(headers).toContain(
      'Content-Type: multipart/related; type="text/html"; boundary="=_test-boundary"',
    );
    expect(headers).not.toContain("Message-ID");
  });

  it("drops X-Unsent when the message is bound for a Drafts folder", () => {
    const eml = build({ unsent: false });
    expect(eml).not.toContain("X-Unsent");
    expect(eml).toContain("MIME-Version: 1.0");
    expect(eml).not.toContain("Message-ID");
  });

  it("uses CRLF everywhere and wraps base64 at 76 columns", () => {
    const eml = build({ html: "<p>" + "x".repeat(500) + "</p>" });
    expect(eml.replace(/\r\n/g, "")).not.toContain("\n");
    for (const line of eml.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
  });

  it("round-trips the HTML through its base64 part", () => {
    const html = "<p>héllo — well, hello</p>";
    const eml = build({ html });
    const [, htmlPart] = eml.split("--=_test-boundary\r\n");
    const body = htmlPart!.split("\r\n\r\n")[1]!.split("\r\n--")[0]!;
    expect(
      Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8"),
    ).toBe(html);
  });

  it("carries each image as an inline cid part", () => {
    const eml = build();
    expect(eml).toContain(`Content-ID: <${IMAGE.cid}>`);
    expect(eml).toContain(
      `Content-Disposition: inline; filename="${IMAGE.filename}"`,
    );
    expect(eml).toContain(
      'Content-Type: image/png; name="devdogs-lockup@2x.png"',
    );
    expect(eml.endsWith("--=_test-boundary--\r\n")).toBe(true);
  });

  it("RFC 2047-encodes a subject that leaves ASCII", () => {
    const eml = build({ subject: "señales — v3.1.0" });
    const subjectLine = eml
      .split("\r\n")
      .find((line) => line.startsWith("Subject: "))!;
    expect(subjectLine).toMatch(/^Subject: =\?utf-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    const decoded = Buffer.from(
      subjectLine.slice("Subject: =?utf-8?B?".length, -2),
      "base64",
    ).toString("utf8");
    expect(decoded).toBe("señales — v3.1.0");
  });
});
