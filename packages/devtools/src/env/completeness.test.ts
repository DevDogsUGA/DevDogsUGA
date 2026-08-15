import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyOnlyKeys,
  neverStoreKeys,
  storableKeys,
  variables,
} from "@devdogsuga/env";
import { PROJECT_ROOT } from "../instance.js";
import { loadRegistry } from "./discovery.js";

/**
 * The registry's completeness test — the third enforcement layer from the
 * model doc, asserting what the first two cannot.
 *
 * Types check each declaration's SHAPE; `define()`'s required second argument
 * checks its PRESENCE. Neither can see across files: that two apps declaring
 * one key agree, that the shipped Flutter manifest holds no secrets, that a
 * legacy key in `.env.example` was actually declared by somebody. Those are
 * runtime facts about the whole registry, so they live in a test — and a
 * failure here fails `pnpm test`, not CI and not a deploy.
 */

beforeAll(async () => {
  await loadRegistry();
});

describe("registry completeness", () => {
  it("populated at all — the floor that keeps every other check honest", () => {
    // ⚠️ The magic number exists because every assertion below quantifies over
    // the registry, and quantifying over an EMPTY set passes vacuously: a
    // discovery bug that imported zero manifests would turn this whole file
    // green. 50 is comfortably under the real count (57 at time of writing)
    // and comfortably over what any single manifest contributes, so it trips
    // on "discovery found nothing" without tripping on an ordinary removal.
    expect(variables().size).toBeGreaterThanOrEqual(50);
  });

  it("duplicate declarations agree on the ENTIRE meta, doc included", () => {
    // Two apps declaring one key is deliberate (shared keys are declared in
    // both manifests so each app is self-describing) — but only while they say
    // the same thing. Divergent scope or secrecy is a routing bug; divergent
    // doc is two answers to "what breaks when this is wrong", and whichever
    // one `.env.example` prints, half the readers get the other. The manifest
    // author used identical doc strings on purpose.
    for (const [key, entries] of variables()) {
      const [first, ...rest] = entries;
      for (const other of rest) {
        expect(
          other.meta,
          `${key} is declared by both "${first!.source}" and "${other.source}" ` +
            "with diverging metadata. Duplicates must agree on every field, " +
            "doc string included — copy one declaration's meta to the other.",
        ).toEqual(first!.meta);
      }
    }
  });

  it("ships no secret in the study-group-finder runtime manifest", () => {
    // Everything in that manifest is compiled into the mobile binary via
    // --dart-define, and anything compiled into a mobile binary is
    // extractable. "No secrets in a shipped binary" is a property of this
    // assertion, not a review habit; dev-time codegen that needs a secret
    // belongs in the separate "study-group-finder:tooling" manifest.
    const shipped = [...variables().values()]
      .flat()
      .filter((e) => e.source === "study-group-finder");

    // Non-vacuous: if discovery ever misses the Flutter manifest, the
    // guarantee is not "upheld", it is unchecked.
    expect(shipped.length).toBeGreaterThan(0);

    for (const entry of shipped) {
      expect(
        entry.meta.secrecy,
        `${entry.key} is in the study-group-finder runtime manifest with ` +
          `secrecy "${entry.meta.secrecy}". Everything there is compiled into ` +
          "the shipped binary and extractable — move it to the " +
          '"study-group-finder:tooling" manifest or make it public.',
      ).toBe("public");
    }
  });

  it("never lets a never-store key become storable", () => {
    // Structurally true today — `storableKeys()` requires `secrecy: "secret"`
    // and `neverStoreKeys()` requires `secrecy: "never-store"`, which cannot
    // both hold. Asserted anyway so a refactor of either selector (say, one
    // that starts reasoning from scope alone) cannot fail open: the failure
    // would be `secrets push` uploading BWS_ACCESS_TOKEN.
    const storable = new Set(storableKeys());
    for (const key of neverStoreKeys()) {
      expect(
        storable.has(key),
        `${key} is never-store yet appears in storableKeys() — secrets push ` +
          "would upload it.",
      ).toBe(false);
    }
  });

  it("pins the apply-only set to exactly its two credentials", () => {
    // Pinned, not derived-and-trusted: a new `tier: "apply"` declaration
    // re-routes a credential behind the production-apply reviewer gate, which
    // is a deliberate, reviewed event — the reviewer of that change should
    // have to touch this list and say so out loud.
    expect(applyOnlyKeys()).toEqual([
      "AIRTABLE_APPLY_PAT",
      "SUPABASE_ACCESS_TOKEN",
    ]);
  });

  it("declares every uncommented key in .env.example", async () => {
    // The catch for a LEGACY key: one that predates the registry, lives in
    // .env.example because it always has, and that nobody declared. Undeclared
    // means invisible to `secrets push` routing and to drift audits — the
    // original four-files failure, surviving in the one file this test can
    // still read. Commented-out lines are prose, not assignments, and are
    // skipped the same way the .env parser skips them.
    const text = await readFile(resolve(PROJECT_ROOT, ".env.example"), "utf8");
    const keys = [...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(0);

    const declared = variables();
    for (const key of keys) {
      expect(
        declared.has(key),
        `${key} is assigned in .env.example but no manifest declares it. ` +
          "Either declare it (define() + declare() in the owning package's " +
          "env.ts) or delete the dead line.",
      ).toBe(true);
    }
  });

  it("gives every declaration a non-empty doc", () => {
    // The doc is what lands in `.env.example`, so it is the only documentation
    // most readers will ever see. (The values themselves are not available
    // here, so "every example parses its own schema" cannot be asserted; this
    // is the enforceable half.)
    for (const [key, entries] of variables()) {
      for (const entry of entries) {
        expect(
          entry.meta.doc.trim().length,
          `${key} (declared by "${entry.source}") has an empty doc.`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
