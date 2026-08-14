import { describe, expect, it } from "vitest";
import { EnvDocument, parseValue, quote } from "./document.js";

/**
 * The `.env` editor, which touches live credentials on a file people hand-edit.
 *
 * Two classes of bug matter here and neither throws:
 *
 *   * **Silent corruption** — a value that round-trips into something that
 *     still looks like a credential and does not authenticate. A truncated
 *     password, a private key that lost its newlines.
 *   * **Silent loss** — a comment, an ordering, or a whole key that the writer
 *     dropped because it only understood assignments.
 *
 * Every case below is one of those.
 */

const FILE = `# Root environment for the monorepo.
#
# Keep this note.

PROJECT_REF="abc123"
# Password for the Postgres role. IMPORTANT: leave UNSET unless running remote
# commands -- an EMPTY value makes the CLI fail.
# SUPABASE_DB_PASSWORD="old-password"
DB_URL="postgresql://x"   # trailing note
export EXPORTED="yes"
`;

describe("EnvDocument round-trip", () => {
  it("returns an untouched file byte for byte", () => {
    // The whole premise. If this fails, every save loses documentation.
    expect(EnvDocument.parse(FILE).toString()).toBe(FILE);
  });

  it("changes only the line it edits", () => {
    const doc = EnvDocument.parse(FILE);
    doc.set("PROJECT_REF", "xyz789");
    const out = doc.toString();

    expect(out).toContain('PROJECT_REF="xyz789"');
    expect(out).toContain("# Root environment for the monorepo.");
    expect(out).toContain("# Keep this note.");
    expect(out).toContain("# commands -- an EMPTY value makes the CLI fail.");
    expect(out.split("\n")).toHaveLength(FILE.split("\n").length);
  });

  it("preserves an `export` prefix when updating in place", () => {
    const doc = EnvDocument.parse(FILE);
    doc.set("EXPORTED", "no");
    expect(doc.toString()).toContain('export EXPORTED="no"');
  });
});

describe("reading", () => {
  it("distinguishes active, commented, and absent", () => {
    const doc = EnvDocument.parse(FILE);

    expect(doc.has("PROJECT_REF")).toBe(true);
    expect(doc.isCommented("PROJECT_REF")).toBe(false);

    expect(doc.has("SUPABASE_DB_PASSWORD")).toBe(false);
    expect(doc.isCommented("SUPABASE_DB_PASSWORD")).toBe(true);

    expect(doc.has("NOTHING")).toBe(false);
    expect(doc.isCommented("NOTHING")).toBe(false);
  });

  it("does not report a commented key as an active value", () => {
    // The dangerous direction: treating `# KEY=old` as configured would push a
    // stale value back to Bitwarden as though someone had chosen it.
    expect(EnvDocument.parse(FILE).get("SUPABASE_DB_PASSWORD")).toBeUndefined();
  });

  it("lists active entries in file order, not sorted", () => {
    expect(EnvDocument.parse(FILE).keys()).toEqual([
      "PROJECT_REF",
      "DB_URL",
      "EXPORTED",
    ]);
  });

  it("drops a trailing comment from the value", () => {
    expect(EnvDocument.parse(FILE).get("DB_URL")).toBe("postgresql://x");
  });
});

describe("commenting out instead of deleting", () => {
  it("comments a key and keeps its value readable", () => {
    const doc = EnvDocument.parse(FILE);
    expect(doc.comment("DB_URL")).toBe(true);

    expect(doc.has("DB_URL")).toBe(false);
    expect(doc.isCommented("DB_URL")).toBe(true);
    // The value is still in the file, which is the point -- a removal has to be
    // recoverable from the file rather than from somebody's memory.
    expect(doc.toString()).toContain('# DB_URL="postgresql://x"');
  });

  it("is idempotent, so a repeated sync cannot produce `## KEY=`", () => {
    const doc = EnvDocument.parse(FILE);
    doc.comment("DB_URL");
    expect(doc.comment("DB_URL")).toBe(false);
    expect(doc.toString()).not.toContain("##");
  });

  it("uncomments an existing commented key rather than appending", () => {
    const doc = EnvDocument.parse(FILE);
    expect(doc.uncomment("SUPABASE_DB_PASSWORD")).toBe("old-password");

    const out = doc.toString();
    expect(out).toContain('SUPABASE_DB_PASSWORD="old-password"');
    // Exactly one occurrence: a second, appended copy is how a file ends up
    // with a stale winner nobody can see.
    expect(out.match(/^\s*#?\s*SUPABASE_DB_PASSWORD=/gm)).toHaveLength(1);
  });

  it("revives a commented key on set, instead of appending a duplicate", () => {
    const doc = EnvDocument.parse(FILE);
    doc.set("SUPABASE_DB_PASSWORD", "new-password");

    const out = doc.toString();
    expect(out).toContain('SUPABASE_DB_PASSWORD="new-password"');
    expect(out).not.toContain("old-password");
    expect(out.match(/^\s*#?\s*SUPABASE_DB_PASSWORD=/gm)).toHaveLength(1);
    // And the surrounding explanation survives.
    expect(out).toContain("# Password for the Postgres role.");
  });

  it("round-trips comment then uncomment back to the original line", () => {
    const doc = EnvDocument.parse(FILE);
    doc.comment("PROJECT_REF");
    doc.uncomment("PROJECT_REF");
    expect(doc.get("PROJECT_REF")).toBe("abc123");
  });
});

describe("appending", () => {
  it("adds a new key at the end, after a blank line", () => {
    const doc = EnvDocument.parse(FILE);
    doc.set("NEW_KEY", "value");
    expect(doc.toString()).toMatch(/\n\nNEW_KEY="value"$/);
  });

  it("works on an empty document", () => {
    const doc = EnvDocument.empty();
    doc.set("A", "1");
    doc.set("B", "2");
    expect(doc.toString()).toBe('A="1"\nB="2"');
  });
});

describe("value fidelity", () => {
  it("keeps a # inside an unquoted value", () => {
    // `#` is ordinary in a generated password. Stripping from the first one
    // truncates the credential to something that still looks like one.
    expect(parseValue("aB3#xY9$k")).toBe("aB3#xY9$k");
    expect(parseValue("value # trailing")).toBe("value");
  });

  it("round-trips a multi-line private key through one line", () => {
    const pem = "-----BEGIN KEY-----\nline1\nline2\n-----END KEY-----";
    const doc = EnvDocument.empty();
    doc.set("GITHUB_APP_PRIVATE_KEY", pem);
    expect(
      EnvDocument.parse(doc.toString()).get("GITHUB_APP_PRIVATE_KEY"),
    ).toBe(pem);
  });

  it("round-trips quotes, backslashes and tabs", () => {
    const nasty = 'a"b\\c\td';
    const doc = EnvDocument.empty();
    doc.set("K", nasty);
    expect(EnvDocument.parse(doc.toString()).get("K")).toBe(nasty);
  });

  it("treats single quotes as literal and double quotes as escaped", () => {
    expect(parseValue("'a\\nb'")).toBe("a\\nb");
    expect(parseValue('"a\\nb"')).toBe("a\nb");
  });

  it("does not expand $VAR", () => {
    // A value that means one thing in the file and another in the process
    // cannot be rotated with confidence.
    expect(parseValue("$HOME/x")).toBe("$HOME/x");
  });

  it("preserves an empty value as present-but-empty", () => {
    const doc = EnvDocument.parse('K=""\n');
    expect(doc.has("K")).toBe(true);
    expect(doc.get("K")).toBe("");
  });

  it("quotes on output so a value with spaces survives", () => {
    expect(quote("two words")).toBe('"two words"');
  });
});
