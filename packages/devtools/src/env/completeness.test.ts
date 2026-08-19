import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyOnlyKeys,
  mintedKeys,
  narrowedKeys,
  neverStoreKeys,
  planOnlyKeys,
  storableKeys,
  variableKeys,
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

  it("uploads no stored credential to the sandbox Worker", () => {
    // `deploy secrets-file` sends a Worker every storable key its
    // app's own manifest declares, excluding `:tooling` sources. For the proxy
    // that set must stay EMPTY: `PLATFORM_REST_URL` is public and arrives as a
    // `--var`, `SANDBOX_PROXY_TOKEN` is minted on the runner. Anything else
    // appearing here is a long-lived secret sitting on an internet-facing
    // Worker that never asked for one.
    //
    // This is a regression test with a name. `SUPABASE_JWT_SIGNING_KEY` was
    // declared `source: "sandbox"` and rode exactly this path onto the proxy —
    // a key that mints a token for ANY role, `service_role` included, handed
    // to the one component built to hold EXECUTE on two functions and no table
    // grants. It belongs in "sandbox:tooling": the mint script runs on the
    // runner, and only the token it produces reaches the edge.
    const runtime = [...variables().values()]
      .flat()
      .filter((e) => e.source === "sandbox");

    // Non-vacuous, twice over: if discovery misses the manifest the set is
    // empty and the assertion below passes while checking nothing, and if the
    // proxy token stops being declared here the mint path has moved.
    expect(runtime.map((e) => e.key).sort()).toEqual([
      "PLATFORM_REST_URL",
      "SANDBOX_PROXY_TOKEN",
    ]);

    const storable = new Set(storableKeys());
    for (const entry of runtime) {
      expect(
        storable.has(entry.key),
        `${entry.key} is declared by the sandbox runtime manifest and is ` +
          "storable, so `deploy secrets-file` would upload it to the proxy " +
          'Worker. Move it to the "sandbox:tooling" manifest if the DEPLOY ' +
          "needs it rather than the Worker.",
      ).toBe(false);
    }
  });

  it("never lets a never-store key become storable", () => {
    // Structurally true today — `storableKeys()` requires `secrecy: "secret"`
    // and `neverStoreKeys()` requires `secrecy: "never-store"`, which cannot
    // both hold. Asserted anyway so a refactor of either selector (say, one
    // that starts reasoning from scope alone) cannot fail open: the failure
    // would be `env push` uploading BWS_ACCESS_TOKEN.
    const storable = new Set(storableKeys());
    for (const key of neverStoreKeys()) {
      expect(
        storable.has(key),
        `${key} is never-store yet appears in storableKeys() — env push ` +
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

  it("pins the minted set to exactly the sandbox proxy token", () => {
    // Pinned rather than derived-and-trusted, for the same reason as the
    // apply-only list above: `minted` suppresses the Cloudflare orphan
    // warning, so adding it to a key is adding an exemption from the one check
    // that notices a Worker secret nobody stores. That should be a reviewed
    // event with this line in the diff.
    expect(mintedKeys()).toEqual(["SANDBOX_PROXY_TOKEN"]);
  });

  it("pins the narrowed set to the dry run's two credentials and its base id", () => {
    // Pinned for the same reason as the two lists above, and with the sharpest
    // consequence of the three: `narrowed` is what lets a key into
    // `devdogs-preflight`, whose GitHub environment is reachable from `main`.
    // Adding it to a key is asserting that what preflight holds under that name
    // cannot do more than a dry run needs — a claim about the OUTSIDE world
    // that no type can check, so the reviewer of that change should have to
    // touch this line.
    //
    // The three are the three SHAPES of the marker, which is why each is named
    // here rather than counted: `DB_URL` is one key name carrying a weaker
    // credential in preflight than in the deployed targets,
    // `AIRTABLE_PLAN_PAT` is a key that is only ever the narrow one — the wider
    // Airtable tokens are separate declarations — and `AIRTABLE_BASE_ID` is not
    // a credential at all, a public identifier that names which base the plan
    // PAT may read and confers no access to it. See `EnvMeta.narrowed`.
    //
    // ⚠️ The third shape is the one to be suspicious of on a fourth key. The
    // test is "would a preflight job fail without it", not "is it public" —
    // most public keys are neither needed there nor safe to add by reflex.
    expect(narrowedKeys()).toEqual([
      "AIRTABLE_BASE_ID",
      "AIRTABLE_PLAN_PAT",
      "DB_URL",
    ]);
  });

  it("keeps the three Airtable tokens three separate declarations", () => {
    // The property that makes `AIRTABLE_PLAN_PAT`'s `narrowed` claim checkable
    // at all. If the scopes were three values of ONE key, "the plan token
    // cannot write" would be a fact about whichever value a target happened to
    // hold, and marking it narrowed would be the DB_URL claim — unverifiable
    // here — rather than a property of the key.
    //
    // Their routing is the other half, and it is what the split buys:
    const airtable = [...variables().keys()].filter((k) =>
      k.startsWith("AIRTABLE_"),
    );
    expect(airtable.sort()).toEqual([
      "AIRTABLE_APPLY_PAT",
      "AIRTABLE_BASE_ID",
      "AIRTABLE_PAT",
      "AIRTABLE_PLAN_PAT",
    ]);

    // never-store: the operator's own token, refused every remote store.
    expect(neverStoreKeys()).toContain("AIRTABLE_PAT");
    // apply-tier: production-apply alone, behind required reviewers.
    expect(applyOnlyKeys()).toContain("AIRTABLE_APPLY_PAT");
    // narrowed AND plan-tier: reaches preflight (where the `main` dry run
    // runs) and production (where `production-plan` runs), nothing else.
    expect(narrowedKeys()).toContain("AIRTABLE_PLAN_PAT");
    expect(planOnlyKeys()).toContain("AIRTABLE_PLAN_PAT");
    expect(applyOnlyKeys()).not.toContain("AIRTABLE_PLAN_PAT");
    expect(neverStoreKeys()).not.toContain("AIRTABLE_PLAN_PAT");
  });

  it("keeps `narrowed` on keys that can actually route somewhere", () => {
    // A committed constant or a per-developer value marked `narrowed` would be
    // a marker that grants nothing and documents a lie: nothing outside
    // `scope: "environment"` reaches a vault project at all. It would also read
    // to the next person as "preflight holds this", which it does not.
    for (const key of narrowedKeys()) {
      for (const entry of variables().get(key) ?? []) {
        expect(
          entry.meta.scope,
          `${key} is narrowed with scope "${entry.meta.scope}"`,
        ).toBe("environment");
      }
    }
    // Non-vacuous — an empty narrowed set would pass the loop checking nothing,
    // and an empty one means `env init --target preflight` renders no keys.
    expect(narrowedKeys().length).toBeGreaterThan(0);
  });

  it("never lets a never-store or minted key be narrowed", () => {
    // Fail-closed, in the two directions where `narrowed` would be an exemption
    // from a stronger rule: a never-store credential must not reach a vault
    // project even a narrow one, and a minted credential has no stored value to
    // put there. Structurally possible today — `narrowed` is checked
    // independently of both — so it is asserted rather than assumed.
    const narrow = new Set(narrowedKeys());
    for (const key of [...neverStoreKeys(), ...mintedKeys()]) {
      expect(
        narrow.has(key),
        `${key} is narrowed, which would route it to devdogs-preflight`,
      ).toBe(false);
    }
    expect(neverStoreKeys().length + mintedKeys().length).toBeGreaterThan(0);
  });

  it("never lets a minted key become storable", () => {
    // The mirror of the never-store check above, and it fails in the same
    // direction: `env push` uploading a value for a credential that is
    // supposed to be signed fresh on every deploy creates precisely the
    // long-lived copy minting exists to avoid. Structurally true today
    // (`storableKeys()` excludes `minted`), asserted so a refactor of that
    // selector cannot quietly reintroduce it.
    const storable = new Set(storableKeys());
    for (const key of mintedKeys()) {
      expect(
        storable.has(key),
        `${key} is minted yet appears in storableKeys() — env push would ` +
          "upload a token that is supposed to exist only on the Worker.",
      ).toBe(false);
    }
  });

  it("gives every minted key a real secrecy, not a substitute for one", () => {
    // `minted` says where the value COMES FROM; `secrecy` still has to say how
    // sensitive it is. A minted key marked `public` would skip every refusal
    // in `selectForPush`, and one marked `never-store` would make the audit
    // demand its deletion from the Worker it lives on.
    for (const key of mintedKeys()) {
      for (const entry of variables().get(key) ?? []) {
        expect(
          entry.meta.secrecy,
          `${key} is minted with the wrong secrecy`,
        ).toBe("secret");
      }
    }
  });

  it("routes every environment-scoped key to exactly one remote store", () => {
    // The property that makes "Bitwarden is the source of truth" true of a
    // WHOLE environment rather than its secret half. Before variables existed,
    // 27 public per-environment keys fell between the two selectors: not
    // storable, not anything else, and so pushed nowhere — which meant CI
    // never received them and `pull` on a fresh machine rebuilt a file that
    // could not boot an app.
    //
    // Quantified over the registry, so a new declaration cannot reopen the gap
    // by being neither.
    const storable = new Set(storableKeys());
    const variableSet = new Set(variableKeys());
    const never = new Set(neverStoreKeys());
    const minted = new Set(mintedKeys());

    let checked = 0;
    for (const [key, entries] of variables()) {
      if (!entries.some((e) => e.meta.scope === "environment")) continue;
      if (never.has(key) || minted.has(key)) continue;
      checked += 1;
      expect(
        storable.has(key) !== variableSet.has(key),
        `${key} is environment-scoped but is in ${
          storable.has(key) ? "BOTH" : "NEITHER"
        } of storableKeys() and variableKeys(). One store, exactly.`,
      ).toBe(true);
    }
    // Non-vacuous: an empty registry, or a filter that excluded everything,
    // would pass the loop above without checking anything.
    expect(checked).toBeGreaterThanOrEqual(40);
  });

  it("puts nothing committed or per-developer in the variable set", () => {
    // Deliberately NOT `neverSecretKeys()`, which ignores scope: it would sweep
    // in `NEXT_PUBLIC_AVATARS_BUCKET` (committed, already in the repo) and
    // `DEV_VPN_HOST` (one contributor's IP). Pushing either gives a value that
    // already has a source of truth a second one to disagree with.
    for (const key of variableKeys()) {
      for (const entry of variables().get(key) ?? []) {
        expect(
          entry.meta.scope,
          `${key} is in variableKeys() with scope "${entry.meta.scope}"`,
        ).toBe("environment");
        expect(entry.meta.secrecy, `${key} is in variableKeys()`).toBe(
          "public",
        );
      }
    }
    // The floor, for the same reason as the count above.
    expect(variableKeys().length).toBeGreaterThanOrEqual(20);

    // And the deny side, named: these are the two the wider selector catches.
    expect(variableKeys()).not.toContain("NEXT_PUBLIC_AVATARS_BUCKET");
    expect(variableKeys()).not.toContain("DEV_VPN_HOST");
  });

  it("keeps the localStack values in the variable set", () => {
    // ⚠️ `localStack: true` means "supplied by `supabase status` in
    // DEVELOPMENT, so absent from .env by design". It describes the local
    // stack and how `.env.example` renders — it is NOT a reason to withhold a
    // deployed value, and staging and production have no stack to supply one.
    // Dropping these makes a deploy point at nothing, silently.
    //
    // Pinned by name because the mistake is a plausible one-line filter that
    // reads as tidying up.
    const variableSet = new Set(variableKeys());
    for (const key of [
      "API_URL",
      "PUBLISHABLE_KEY",
      "REST_URL",
      "S3_PROTOCOL_REGION",
      "STORAGE_S3_URL",
    ]) {
      expect(
        variableSet.has(key),
        `${key} is a public per-environment value that the local stack also ` +
          "supplies. It still has to reach staging and production.",
      ).toBe(true);
    }
    // POSITIVE CONTROL: the same metadata on a SECRET still routes to the
    // secret store, so the assertions above are about scope and secrecy rather
    // than `localStack` having become a synonym for "variable".
    expect(variableSet.has("S3_PROTOCOL_ACCESS_KEY_SECRET")).toBe(false);
    expect(new Set(storableKeys()).has("S3_PROTOCOL_ACCESS_KEY_SECRET")).toBe(
      true,
    );
  });

  it("never lets a never-store key become a variable", () => {
    // The mirror of the `storableKeys()` check above, and the worse failure of
    // the two: `env push` sending BWS_ACCESS_TOKEN to the SECRET store
    // would at least be write-only, whereas the variable store publishes its
    // value to anyone who can read the repository's Actions config.
    const variableSet = new Set(variableKeys());
    for (const key of neverStoreKeys()) {
      expect(
        variableSet.has(key),
        `${key} is never-store yet appears in variableKeys() — env push ` +
          "would publish it in plaintext as a GitHub variable.",
      ).toBe(false);
    }
    // Non-vacuous: an empty `neverStoreKeys()` would pass this trivially, and
    // an empty one is exactly the fail-open state discovery.ts guards against.
    expect(neverStoreKeys()).toEqual(["AIRTABLE_PAT", "BWS_ACCESS_TOKEN"]);
  });

  it("declares every uncommented key in .env.example", async () => {
    // The catch for a LEGACY key: one that predates the registry, lives in
    // .env.example because it always has, and that nobody declared. Undeclared
    // means invisible to `env push` routing and to drift audits — the
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

  it("renders every declared key into .env.example", async () => {
    // The converse of the check above, made possible now the file is
    // generated: a declared variable that never reaches .env.example is
    // documentation nobody will see. Every key appears — as an assignment,
    // commented out (developer scope, disable-by-default), or as a named
    // comment block (never-store) — so a plain mention is the right floor.
    const text = await readFile(resolve(PROJECT_ROOT, ".env.example"), "utf8");
    for (const key of variables().keys()) {
      expect(
        text.includes(key),
        `${key} is declared but absent from .env.example — regenerate it ` +
          "with `pnpm devtools env example`.",
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
