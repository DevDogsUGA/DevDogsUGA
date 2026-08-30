import { describe, expect, it } from "vitest";
import { escapeHtml, fill, safeUrl, type Compiled } from "./fill.js";

/**
 * The runtime is small enough to test exhaustively, and it is the only part
 * that ever sees a real member's name.
 */

const compiled: Compiled = {
  chunks: ['<a href="', '">Hi ', "</a>"],
  slots: ["acceptUrl", "name"],
  urlSlots: ["acceptUrl"],
};

describe("substitution", () => {
  it("interleaves chunks and slots", () => {
    expect(
      fill(
        compiled,
        { acceptUrl: "https://devdogsuga.org/t", name: "Sam" },
        true,
      ),
    ).toBe('<a href="https://devdogsuga.org/t">Hi Sam</a>');
  });

  it("fills a missing prop with empty rather than 'undefined'", () => {
    // A missing prop is a bug, but the failure should be a gap in a sentence
    // rather than the word "undefined" arriving in somebody's inbox.
    expect(fill(compiled, { acceptUrl: "https://x.test/" }, true)).toBe(
      '<a href="https://x.test/">Hi </a>',
    );
  });

  it("substitutes a repeated slot at every position", () => {
    const repeated: Compiled = {
      chunks: ["", " and ", ""],
      slots: ["name", "name"],
      urlSlots: [],
    };
    expect(fill(repeated, { name: "Sam" }, true)).toBe("Sam and Sam");
  });
});

describe("escaping", () => {
  it("escapes a user-authored team name", () => {
    // The case the whole escape-at-fill-time rule exists for: team names are
    // typed by members, and a team called <script> must not become one.
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("escapes quotes, so a value cannot break out of an attribute", () => {
    expect(escapeHtml(`" onmouseover="x`)).toBe("&quot; onmouseover=&quot;x");
  });

  it("does not escape the text part", () => {
    expect(
      fill(compiled, { acceptUrl: "https://x.test/", name: "A & B" }, false),
    ).toContain("A & B");
  });

  it("escapes the html part", () => {
    expect(
      fill(compiled, { acceptUrl: "https://x.test/", name: "A & B" }, true),
    ).toContain("A &amp; B");
  });
});

describe("url slots", () => {
  it("passes an ordinary https url through", () => {
    expect(safeUrl("https://devdogsuga.org/teams/abc")).toBe(
      "https://devdogsuga.org/teams/abc",
    );
  });

  it("refuses a javascript: url", () => {
    // encodeURI leaves this completely intact, which is why the scheme check
    // exists rather than encoding alone.
    expect(safeUrl("javascript:alert(1)")).toBe("#");
  });

  it("refuses a data: url", () => {
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
  });

  it("refuses a scheme-relative url", () => {
    expect(safeUrl("//evil.test/steal")).toBe("#");
  });

  it("encodes a space rather than breaking the attribute", () => {
    expect(safeUrl("https://x.test/a b")).toBe("https://x.test/a%20b");
  });

  it("applies url handling only to declared url slots", () => {
    const asText: Compiled = {
      chunks: ["", ""],
      slots: ["acceptUrl"],
      urlSlots: [],
    };
    // Same slot name, not declared as a url slot: escaped, not scheme-checked.
    expect(fill(asText, { acceptUrl: "javascript:x" }, true)).toBe(
      "javascript:x",
    );
  });
});
