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

describe("stamping where a value came from", () => {
  const stamp = {
    environment: "staging",
    action: "pulled" as const,
    date: "2026-08-13",
  };

  it("writes the environment and date beside the value", () => {
    const doc = EnvDocument.parse(FILE);
    doc.set("PROJECT_REF", "xyz789", stamp);
    expect(doc.toString()).toContain(
      'PROJECT_REF="xyz789" # [staging pulled 2026-08-13]',
    );
  });

  it("replaces its own stamp rather than stacking them", () => {
    // Twenty pulls must not produce twenty comments.
    const doc = EnvDocument.parse(FILE);
    doc.set("PROJECT_REF", "a", stamp);
    doc.set("PROJECT_REF", "b", { ...stamp, date: "2026-09-01" });

    const line = doc
      .toString()
      .split("\n")
      .find((l) => l.startsWith("PROJECT_REF"))!;
    expect(line).toBe('PROJECT_REF="b" # [staging pulled 2026-09-01]');
    expect(line.match(/\[/g)).toHaveLength(1);
  });

  it("does not read the stamp as part of the value", () => {
    const doc = EnvDocument.parse(
      'TOKEN="secret" # [production pushed 2026-08-13]\n',
    );
    expect(doc.get("TOKEN")).toBe("secret");
  });

  it("keeps a # that belongs to the value", () => {
    const doc = EnvDocument.parse('PW="aB3#xY9$k"\n');
    doc.set("PW", "aB3#xY9$k", stamp);
    expect(doc.get("PW")).toBe("aB3#xY9$k");
    expect(doc.toString()).toContain("# [staging pulled 2026-08-13]");
  });

  it("moves somebody's own note above the key instead of overwriting it", () => {
    // The note was written about this key. Destroying it to record a sync date
    // trades a person's explanation for a machine's bookkeeping.
    const doc = EnvDocument.parse('DB_URL="x"   # set by hand, do not sync\n');
    doc.set("DB_URL", "y", stamp);

    expect(doc.toString().split("\n")).toEqual([
      "# set by hand, do not sync",
      'DB_URL="y" # [staging pulled 2026-08-13]',
      "",
    ]);
  });

  it("moves that note above the commented-out history too", () => {
    const doc = EnvDocument.parse(
      ['# DB_URL="older"', '# DB_URL="old"', 'DB_URL="now"  # careful'].join(
        "\n",
      ),
    );
    doc.set("DB_URL", "next", stamp);

    expect(doc.toString().split("\n")).toEqual([
      "# careful",
      '# DB_URL="older"',
      '# DB_URL="old"',
      'DB_URL="next" # [staging pulled 2026-08-13]',
    ]);
  });

  it("keeps a trailing comment when no stamp is given", () => {
    // Spacing is normalised to one space, not preserved. The line is being
    // rewritten anyway — the value changed length — so the original column
    // alignment is already gone, and a canonical form beats a half-kept one.
    const doc = EnvDocument.parse(FILE);
    doc.set("DB_URL", "postgresql://y");
    expect(doc.toString()).toContain('DB_URL="postgresql://y" # trailing note');
  });
});

describe("keeping same-named lines together", () => {
  it("moves a stray commented copy up to its active line", () => {
    const doc = EnvDocument.parse(
      ['A="1"', "", "# some section", 'B="2"', '# A="old"'].join("\n"),
    );
    expect(doc.group()).toBe(true);
    expect(doc.toString().split("\n")).toEqual([
      'A="1"',
      '# A="old"',
      "",
      "# some section",
      'B="2"',
    ]);
  });

  it("leaves an already-tidy file byte for byte", () => {
    // It runs on every write, so it must be a no-op on the common case.
    const doc = EnvDocument.parse(FILE);
    expect(doc.group()).toBe(false);
    expect(doc.toString()).toBe(FILE);
  });

  it("keeps the first occurrence in place, so its documentation stays put", () => {
    const doc = EnvDocument.parse(
      ["# what A is for", '# A="old"', 'B="2"', 'A="1"'].join("\n"),
    );
    doc.group();
    expect(doc.toString().split("\n")).toEqual([
      "# what A is for",
      '# A="old"',
      'A="1"',
      'B="2"',
    ]);
  });
});

describe("reset", () => {
  it("comments out each value and leaves an empty one under it", () => {
    const doc = EnvDocument.parse('A="1"\nB="2"\n');
    expect(doc.reset()).toEqual(["A", "B"]);
    expect(doc.toString().split("\n")).toEqual([
      '# A="1"',
      'A=""',
      '# B="2"',
      'B=""',
      "",
    ]);
  });

  it("loses nothing — every value stays readable in the file", () => {
    const doc = EnvDocument.parse(FILE);
    doc.reset();
    const out = doc.toString();
    expect(out).toContain('# PROJECT_REF="abc123"');
    expect(out).toContain('# DB_URL="postgresql://x"');
    expect(out).toContain("# Keep this note.");
    // And the file still declares every key, which is what makes it a checklist.
    expect(doc.keys()).toEqual(["PROJECT_REF", "DB_URL", "EXPORTED"]);
    expect(doc.get("PROJECT_REF")).toBe("");
  });

  it("keeps an export prefix on the blank line", () => {
    const doc = EnvDocument.parse('export EXPORTED="yes"\n');
    doc.reset();
    expect(doc.toString()).toContain('export EXPORTED=""');
  });

  it("skips a key that is already empty", () => {
    // Commenting out `A=""` to write `A=""` underneath is churn that makes the
    // next diff harder to read.
    const doc = EnvDocument.parse('A=""\nB="2"\n');
    expect(doc.reset()).toEqual(["B"]);
    expect(doc.toString().split("\n")[0]).toBe('A=""');
  });

  it("leaves already-commented lines alone", () => {
    const doc = EnvDocument.parse('# A="old"\nB="2"\n');
    doc.reset();
    expect(doc.toString()).not.toContain("##");
  });
});
