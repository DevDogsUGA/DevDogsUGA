/**
 * The one question two very different callers ask: is this `example` a VALUE?
 *
 * `devtools deploy write-env` asks it to decide what a deploy job writes into a
 * runner's env file, and `env init --target` asks it to decide what a person is
 * handed to fill in. When they disagree, the file CI composes and the file a
 * human curates stop being the same file.
 *
 * Every case below asserts a deny as well as an allow. The mechanism here IS
 * the refusal: a predicate stuck at `true` would ship `http://localhost:3000`
 * to production, and one stuck at `false` would turn a fill-in-the-blanks file
 * into a blank page.
 */
import { describe, expect, it } from "vitest";
import { derivationOf, envReferences, expandReferences } from "./derivation.js";
import type { EnvMeta } from "./meta.js";

const meta = (example: string, over: Partial<EnvMeta> = {}): EnvMeta => ({
  doc: "A variable.",
  scope: "environment",
  secrecy: "public",
  example,
  ...over,
});

describe("envReferences", () => {
  it("reads both spellings, and the whole name", () => {
    expect(envReferences("$BASE_URL/auth/callback")).toEqual(["BASE_URL"]);
    expect(envReferences("${BASE_URL}/x")).toEqual(["BASE_URL"]);
    expect(envReferences("https://$PROJECT_REF.supabase.co/rest/v1")).toEqual([
      "PROJECT_REF",
    ]);
    // Greedy to the end of the name, so `$BASE_URL_CALLBACK` is one reference
    // and not `BASE_URL` with a suffix. That is the difference between
    // expanding the right variable and expanding a shorter one that shares a
    // prefix.
    expect(envReferences("$BASE_URL_CALLBACK")).toEqual(["BASE_URL_CALLBACK"]);
  });

  it("ignores a `$` that names nothing", () => {
    expect(envReferences("pa$$word")).toEqual([]);
    expect(envReferences("$5 per seat")).toEqual([]);
    // Lowercase is not a declared key's shape, and treating it as a reference
    // would classify a placeholder as a derivation.
    expect(envReferences("$notakey")).toEqual([]);
  });

  it("carries no state between calls", () => {
    // The shared `/g` literal is a real hazard: a `lastIndex` surviving one
    // call would make the next one skip its first match, intermittently and
    // only under a specific call order.
    expect(envReferences("$A/$B")).toEqual(["A", "B"]);
    expect(envReferences("$A/$B")).toEqual(["A", "B"]);
  });
});

describe("derivationOf", () => {
  it("accepts a formula built from other variables", () => {
    expect(derivationOf(meta("https://$PROJECT_REF.supabase.co"))).toBe(
      "https://$PROJECT_REF.supabase.co",
    );
    expect(derivationOf(meta("$API_URL"))).toBe("$API_URL");
    expect(derivationOf(meta("$BASE_URL/auth/callback"))).toBe(
      "$BASE_URL/auth/callback",
    );
  });

  it("refuses a development default and a placeholder", () => {
    // Both are non-empty, so every consumer downstream treats them as values
    // and pushes them. `BASE_URL` and `GH_APP_ID` reached a generated
    // `.env.production` this way.
    expect(derivationOf(meta("http://localhost:3000"))).toBeNull();
    expect(derivationOf(meta("000000"))).toBeNull();
    expect(derivationOf(meta("us-east-1"))).toBeNull();
  });

  it("refuses a formula with a fill-me hole in it", () => {
    // `DB_URL`'s shape: a real `$PROJECT_REF` derivation with two holes. Its
    // `secrecy` catches it first today, so this asserts the gate that would
    // still catch a public one.
    expect(
      derivationOf(meta("postgresql://postgres.$PROJECT_REF:<password>@h/db")),
    ).toBeNull();
  });

  it("refuses a secret's example, formula-shaped or not", () => {
    // A secret's `example` is never a value; it is a shape somebody wrote to
    // show what to paste.
    expect(derivationOf(meta("$API_URL", { secrecy: "secret" }))).toBeNull();
    expect(
      derivationOf(meta("$API_URL", { secrecy: "never-store" })),
    ).toBeNull();
  });

  it("refuses an absent or empty example", () => {
    expect(
      derivationOf({ doc: "d", scope: "environment", secrecy: "public" }),
    ).toBeNull();
    expect(derivationOf(meta(""))).toBeNull();
  });

  it("says nothing about a committed constant", () => {
    // `scope: "default"` values are real and usable, but they are constants
    // rather than derivations. The deploy script routes them by scope, and a
    // target's env file leaves them out entirely.
    expect(derivationOf(meta("DevDogsUGA", { scope: "default" }))).toBeNull();
    // Unless it genuinely is a formula, which the scope does not affect.
    expect(derivationOf(meta("$GITHUB_ORG", { scope: "default" }))).toBe(
      "$GITHUB_ORG",
    );
  });
});

describe("expandReferences", () => {
  it("resolves a reference against `raw`, order-independently", () => {
    // The bug this exists to fix: `raw` is a complete map, not a running
    // accumulator built left-to-right, so a name defined LATER in the caller's
    // own file (or iteration order) still resolves.
    const raw = new Map([
      ["API_URL", "https://$PROJECT_REF.supabase.co"],
      ["PROJECT_REF", "fqpbnmwyopohbhzkpoiu"],
    ]);
    expect(expandReferences("API_URL", raw.get("API_URL")!, raw, {})).toBe(
      "https://fqpbnmwyopohbhzkpoiu.supabase.co",
    );
  });

  it("resolves a chained reference (NEXT_PUBLIC_SUPABASE_URL -> API_URL -> PROJECT_REF)", () => {
    const raw = new Map([
      ["NEXT_PUBLIC_SUPABASE_URL", "$API_URL"],
      ["API_URL", "https://$PROJECT_REF.supabase.co"],
      ["PROJECT_REF", "fqpbnmwyopohbhzkpoiu"],
    ]);
    expect(
      expandReferences(
        "NEXT_PUBLIC_SUPABASE_URL",
        raw.get("NEXT_PUBLIC_SUPABASE_URL")!,
        raw,
        {},
      ),
    ).toBe("https://fqpbnmwyopohbhzkpoiu.supabase.co");
  });

  it("throws naming the whole chain on a cycle", () => {
    const raw = new Map([
      ["A", "$B"],
      ["B", "$C"],
      ["C", "$A"],
    ]);
    expect(() => expandReferences("A", raw.get("A")!, raw, {})).toThrow(
      /derives back from it \(chain: B -> C -> A -> B\)/,
    );
  });

  it("falls back to `resolved`, and to empty for a name in neither map — unchanged from today", () => {
    const raw = new Map([["BASE_URL", "$ORIGIN/callback"]]);
    expect(
      expandReferences("BASE_URL", raw.get("BASE_URL")!, raw, {
        ORIGIN: "https://devdogsuga.org",
      }),
    ).toBe("https://devdogsuga.org/callback");

    // STUDY_GROUP_FINDER_URL is declared ahead of its own deployment (see
    // write-env.ts's MissingSourceError) — an unresolved reference has always
    // meant "", not a thrown error, and this preserves that.
    expect(
      expandReferences(
        "STUDY_GROUP_FINDER_CALLBACK",
        "$STUDY_GROUP_FINDER_URL/callback",
        raw,
        {},
      ),
    ).toBe("/callback");
  });
});
