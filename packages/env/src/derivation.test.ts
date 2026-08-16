/**
 * The one question two very different callers ask: is this `example` a VALUE?
 *
 * `scripts/deploy-write-env.ts` asks it to decide what a deploy job writes
 * into a runner's env file, and `env init --target` asks it to decide what a
 * person is handed to fill in. A disagreement between them is not a cosmetic
 * one — it means the file CI composes and the file a human curates stop being
 * the same file.
 *
 * Every case below asserts a deny as well as an allow. The mechanism here IS
 * the refusal: a predicate stuck at `true` would ship `http://localhost:3000`
 * to production, and one stuck at `false` would turn a fill-in-the-blanks file
 * into a blank page.
 */
import { describe, expect, it } from "vitest";
import { derivationOf, envReferences } from "./derivation.js";
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
    // and not `BASE_URL` with a suffix — the difference between expanding the
    // right variable and expanding a shorter one that happens to share a
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
    // call would make the next one skip its first match, non-deterministically
    // and only in the presence of a specific call order.
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
    // and pushes them. `BASE_URL` and `GITHUB_APP_ID` reached a generated
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
    // rather than derivations — the deploy script routes them by scope, and a
    // target's env file leaves them out entirely.
    expect(derivationOf(meta("DevDogsUGA", { scope: "default" }))).toBeNull();
    // …unless it genuinely is a formula, which the scope does not affect.
    expect(derivationOf(meta("$GITHUB_ORG", { scope: "default" }))).toBe(
      "$GITHUB_ORG",
    );
  });
});
