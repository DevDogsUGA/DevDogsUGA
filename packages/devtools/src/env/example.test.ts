/**
 * What `env init --target <vault target>` is allowed to write.
 *
 * The file this renders exists to be FILLED IN AND PUSHED, which makes both of
 * its failure modes silent ones:
 *
 *   * a prefilled value that is wrong for a deployed target — `BASE_URL` as
 *     `http://localhost:3000`, `GH_APP_PRIVATE_KEY` as a placeholder PEM —
 *     is non-empty, so `selectForPush()` sends it, and `env audit` then reports
 *     NO DRIFT because the stored value matches the file it came from. A clean
 *     audit over a broken production is the worst outcome this system has.
 *   * a must-fill key shipped COMMENTED — 17 of staging's 45 did, including
 *     `SUPABASE_DB_PASSWORD` and all four OAuth client secrets — swallows the
 *     value typed on it, because a commented line is not an assignment.
 *
 * ⚠️ EVERYTHING HERE PARSES THE RENDERED TEXT with its own regexes and
 * recomputes the expected key set from raw `variables()` metadata. Reusing
 * `keysRoutedTo()` or `ASSIGNMENT` from the module under test would make most
 * of these tests tautologies — they would agree with the renderer about a
 * shared mistake, which is the exact shape of the bug they exist to catch.
 *
 * The development rendering is pinned here too, and deliberately so: it is the
 * one this change must NOT touch, and `setup.ts` seeds every contributor's
 * `.env` from it.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  TARGETS,
  VAULT_TARGETS,
  applyOnlyKeys,
  mintedKeys,
  neverStoreKeys,
  variables,
  type VaultTarget,
} from "@devdogsuga/env";
import { loadRegistry } from "./discovery.js";
import {
  keysForSections,
  renderExample,
  renderInit,
  resolveSections,
} from "./example.js";

const DATE = "2026-08-16";

beforeAll(async () => {
  await loadRegistry();
});

// ── an independent reading of the rendered file ──────────────────────────────

/** `KEY="value"`, active. Its own regex — see the header. */
const ACTIVE = /^([A-Z][A-Z0-9_]*)="(.*)"$/;
/** `# KEY="value"` — the same line, commented out. */
const COMMENTED = /^#\s?([A-Z][A-Z0-9_]*)="(.*)"$/;
/** `$NAME` / `${NAME}`, dotenvx's expansion syntax. */
const REFERENCE = /\$\{([A-Z][A-Z0-9_]*)\}|\$([A-Z][A-Z0-9_]*)/g;

interface Parsed {
  /** Assignable lines: key → value, in file order. */
  active: Map<string, string>;
  /** Keys whose only line is commented out. */
  commented: Set<string>;
  /** Section labels, in file order. */
  sections: string[];
  /** Section label → how many assignable lines followed it. */
  assignmentsPerSection: Map<string, number>;
}

function parse(text: string): Parsed {
  const active = new Map<string, string>();
  const commented = new Set<string>();
  const sections: string[] = [];
  const assignmentsPerSection = new Map<string, number>();
  const lines = text.split("\n");

  let section: string | null = null;
  for (const [index, line] of lines.entries()) {
    // A section label is the line between two rules.
    if (
      line.startsWith("# ---") &&
      lines[index + 2]?.startsWith("# ---") === true
    ) {
      section = lines[index + 1]!.slice(2);
      sections.push(section);
      assignmentsPerSection.set(section, 0);
      continue;
    }

    const activeMatch = ACTIVE.exec(line);
    if (activeMatch) {
      active.set(activeMatch[1]!, activeMatch[2]!);
      if (section !== null) {
        assignmentsPerSection.set(
          section,
          assignmentsPerSection.get(section)! + 1,
        );
      }
      continue;
    }
    const commentedMatch = COMMENTED.exec(line);
    if (commentedMatch) commented.add(commentedMatch[1]!);
  }

  return { active, commented, sections, assignmentsPerSection };
}

/** Everything from the first section rule on — the header dropped. */
function bodyOf(text: string): string {
  return text.slice(text.indexOf("\n# ---------"));
}

function references(value: string): string[] {
  return [...value.matchAll(REFERENCE)].map((m) => (m[1] ?? m[2])!);
}

const target = (name: VaultTarget): Parsed => parse(renderInit(name, DATE));
const development = (): Parsed => parse(renderInit("development", DATE));

/** Every key with a line of any kind — active or commented. */
function mentioned(file: Parsed): Set<string> {
  return new Set([...file.active.keys(), ...file.commented]);
}

// ── an independent reading of the registry ───────────────────────────────────

/**
 * The keys a push for `target` routes, recomputed from the metadata.
 *
 * Deliberately NOT `keysRoutedTo()`: this is the claim that function is
 * supposed to satisfy, written out from the four rules that decide it —
 * "`scope: environment`, storable somewhere, not minted", "apply-tier is
 * production's alone", "plan-tier belongs to the targets whose plan jobs run
 * (preflight and production)", and "a target no app boots from carries only
 * what opted in". The last is spelled out from `deployEnv` and `meta.narrowed`
 * here, not read from `holdsOnlyNarrowedKeys()` / `narrowedKeys()`, so that a
 * renderer and a selector agreeing on a shared mistake still fails.
 */
function routedByHand(name: VaultTarget): Set<string> {
  const narrowTarget = !TARGETS[name].deployEnv;
  const keys = new Set<string>();
  for (const [key, entries] of variables()) {
    const storedSomewhere = entries.some(
      (e) =>
        e.meta.scope === "environment" &&
        (e.meta.secrecy === "secret" || e.meta.secrecy === "public") &&
        e.meta.minted !== true,
    );
    const applyOnly = entries.some((e) => e.meta.tier === "apply");
    const planOnly = entries.some((e) => e.meta.tier === "plan");
    // Opting in takes EVERY declaration, matching `narrowedKeys()`: this is an
    // exemption from an exclusion, and an exemption one of two declarations
    // grants is an exemption granted by accident.
    const narrowed = entries.every((e) => e.meta.narrowed === true);
    if (narrowTarget && !narrowed) continue;
    if (!storedSomewhere) continue;
    if (applyOnly && name !== "production") continue;
    // Plan-tier: production keeps it (production-plan), the narrow target
    // takes it through its own opt-in above, staging has no job that reads it.
    if (planOnly && name !== "production" && !narrowTarget) continue;
    keys.add(key);
  }
  return keys;
}

/**
 * The vault targets an app actually boots from — staging and production.
 *
 * The block below them asserts things about a file with 45 keys in it: that it
 * kept its derivations, that it blanked the localhost defaults, that its
 * must-fill secrets are assignable. None of that is meaningful for `preflight`,
 * which carries one key on purpose; it gets its own describe at the bottom,
 * where "one key" is the claim rather than an embarrassment.
 */
const DEPLOYED_VAULT_TARGETS = VAULT_TARGETS.filter(
  (name) => TARGETS[name].deployEnv,
);

/** Keys every one of whose declarations carries `scope`. */
function scoped(scope: string): string[] {
  return [...variables().entries()]
    .filter(([, entries]) => entries.every((e) => e.meta.scope === scope))
    .map(([key]) => key);
}

/** Keys some declaration of which asks to ship commented out. */
function commentedByDeclaration(): string[] {
  return [...variables().entries()]
    .filter(([, entries]) => entries.some((e) => e.meta.commented === true))
    .map(([key]) => key);
}

/** The `example` a key declares, or `""`. */
function declaredExample(key: string): string {
  return variables().get(key)![0]!.meta.example ?? "";
}

// ── the invariant ────────────────────────────────────────────────────────────

describe.each(VAULT_TARGETS)("%s", (name) => {
  it("writes nothing but blanks and derivations this file can expand", () => {
    // THE invariant, and it is mechanical on purpose: no list of keys to keep
    // up to date, so a variable added tomorrow with a localhost default or a
    // `<fill-me>` placeholder fails here rather than in production.
    const { active } = target(name);

    for (const [key, value] of active) {
      if (value === "") continue;

      const refs = references(value);
      expect(
        refs.length,
        `${key}="${value}" is non-empty and derives from nothing — it is a ` +
          "development default or a placeholder, and push would send it",
      ).toBeGreaterThan(0);

      for (const ref of refs) {
        expect(
          active.has(ref),
          `${key} derives from $${ref}, which has no line in this file — ` +
            "the formula cannot expand, so the literal would be pushed",
        ).toBe(true);
      }

      // The hybrid case: a real derivation with fill-me holes punched into it,
      // like DB_URL's `postgresql://postgres.$PROJECT_REF:<password>@<host>…`.
      expect(
        value.replaceAll(REFERENCE, ""),
        `${key} carries a fill-me marker outside its references`,
      ).not.toMatch(/[<>]/);
    }
  });

  it("never invents a value", () => {
    // Whatever survives is the declared `example` verbatim. Rules out a
    // renderer that "helpfully" rewrites localhost into something else.
    const { active } = target(name);
    for (const [key, value] of active) {
      if (value !== "") expect(value).toBe(declaredExample(key));
    }
  });

  it("ships every key it carries uncommented", () => {
    // The whole file is a form to fill in. A commented line is not an
    // assignment — `selectForPush` never sees one — so a value typed on it is
    // silently dropped by the push this file exists to feed.
    const file = target(name);
    expect([...file.commented]).toEqual([]);
    expect(file.active.size).toBeGreaterThan(0);
  });

  it("carries exactly the keys a push for it routes", () => {
    const file = target(name);
    const expected = routedByHand(name);

    expect(expected.size).toBeGreaterThan(0);
    expect([...file.active.keys()].sort()).toEqual([...expected].sort());
  });

  it("leaves out the committed and per-developer values", () => {
    const file = mentioned(target(name));
    const committed = scoped("default");
    const developer = scoped("developer");

    // Positive controls: both sets are real, so the loops below quantify over
    // something. This suite has been bitten by an assertion over an empty set.
    expect(committed.length).toBeGreaterThan(0);
    expect(developer.length).toBeGreaterThan(0);

    for (const key of [...committed, ...developer]) {
      expect(
        file.has(key),
        `${key} is scope default/developer and has no meaning in ${name}`,
      ).toBe(false);
    }
  });

  it("leaves out the minted and never-store credentials", () => {
    const file = mentioned(target(name));

    expect(mintedKeys().length).toBeGreaterThan(0);
    expect(neverStoreKeys().length).toBeGreaterThan(0);

    for (const key of [...mintedKeys(), ...neverStoreKeys()]) {
      expect(file.has(key), `${key} must have no assignable line`).toBe(false);
    }
  });

  it("prints no section heading over an empty section", () => {
    // Every section survives the filter today, so this is a guard rather than
    // a caught bug: a heading over nothing claims "this app needs nothing
    // here", which is a different and false statement.
    const file = target(name);
    expect(file.sections.length).toBeGreaterThan(0);
    for (const section of file.sections) {
      expect(file.assignmentsPerSection.get(section), section).toBeGreaterThan(
        0,
      );
    }
  });
});

// ── the deployed targets, whose files are the full form ──────────────────────

describe.each(DEPLOYED_VAULT_TARGETS)("%s", (name) => {
  it("keeps the derivations — the file is not simply blanked", () => {
    // The positive control for the invariant above, which every line passes
    // vacuously if the renderer empties everything. Losing the derivations
    // turns a fill-in-the-blanks file into a blank page, and they are the one
    // kind of value that IS right in a deployed environment.
    const { active } = target(name);
    const derived = [...active].filter(([, value]) => value !== "");

    expect(derived.length).toBeGreaterThanOrEqual(8);
    expect(active.get("API_URL")).toBe("https://$PROJECT_REF.supabase.co");
    expect(active.get("NEXT_PUBLIC_SUPABASE_URL")).toBe("$API_URL");
    expect(active.get("BASE_URL_CALLBACK")).toBe("$BASE_URL/auth/callback");
  });

  it("drops the values that were wrong for a deployed target", () => {
    // The named regressions from the bug report, asserted as present-and-empty
    // rather than absent: the key still needs its line, it is the VALUE that
    // had to go.
    const { active } = target(name);
    for (const key of [
      "BASE_URL",
      "SCHEDULE_BUILDER_URL",
      "GH_APP_ID",
      "GH_APP_INSTALLATION_ID",
      "GH_APP_PRIVATE_KEY",
      "DB_URL",
      "GOOGLE_CLIENT_ID",
    ]) {
      expect(active.get(key), `${key} should ship blank`).toBe("");
      // …and each of these really does declare a value, so the assertion above
      // is about the renderer dropping it rather than there being none.
      expect(declaredExample(key), `${key} declares an example`).not.toBe("");
    }
  });

  it("uncomments the keys the registry asks to comment out", () => {
    // The `commented: true` decision, asserted rather than described. It
    // encodes "unset and empty are different states" — true of the Supabase
    // CLI reading `.env`, and irrelevant to push, which skips an empty value
    // and never reads a commented line at all. In a file that exists to be
    // pushed, the flag would only hide the must-fill keys.
    const { active } = target(name);
    const routed = commentedByDeclaration().filter((key) =>
      routedByHand(name).has(key),
    );

    expect(routed.length).toBeGreaterThanOrEqual(10);
    expect(routed).toContain("SUPABASE_DB_PASSWORD");
    for (const key of routed) {
      expect(active.has(key), `${key} must be assignable in ${name}`).toBe(
        true,
      );
    }
  });
});

// ── the CI-only target, whose file is one line ───────────────────────────────

/**
 * `preflight` renders only the keys that opted in with `narrowed`.
 *
 * The finding this closes: `env init --target preflight` wrote 45 keys, and a
 * person who filled that file in and pushed it put the token-minting key, the
 * service-role key and the GitHub App private key into `preflight` —
 * whose GitHub environment is reachable from `main`. §3.5 of the security plan
 * refuses even a general read-only Postgres role at that tier.
 */
describe("preflight", () => {
  it("is the target the split is about — not a deploy environment", () => {
    // The premise, asserted so the two blocks above cannot silently become
    // the same block. If `preflight` ever gained `deployEnv: true`, it would
    // rejoin the 45-key describe and every assertion below would move with it.
    expect(DEPLOYED_VAULT_TARGETS).toEqual(["staging", "production"]);
    expect(VAULT_TARGETS).toContain("preflight");
    expect(TARGETS.preflight.deployEnv).toBe(false);
  });

  it("carries the narrowed keys and nothing else", () => {
    const { active } = target("preflight");
    expect([...active.keys()].sort()).toEqual(["AIRTABLE_PLAN_PAT", "DB_URL"]);
  });

  it("carries none of the three credentials the finding named", () => {
    // BY NAME, because these three are the finding rather than a sample of it:
    // a key that mints a token for any role including `service_role`, the
    // service-role key itself, and the private key of the GitHub App.
    const file = mentioned(target("preflight"));
    for (const key of [
      "SUPABASE_JWT_SIGNING_KEY",
      "SECRET_KEY",
      "GH_APP_PRIVATE_KEY",
    ]) {
      expect(file.has(key), `${key} must not reach preflight`).toBe(false);
      // POSITIVE CONTROL: each really is a key some target carries, so "absent
      // from preflight" is a routing decision and not a typo'd key name that
      // was never in any file.
      expect(
        mentioned(target("production")).has(key),
        `${key} is no longer declared under that name`,
      ).toBe(true);
    }
  });

  it("shrinks preflight WITHOUT shrinking staging or production", () => {
    // The regression that would make this whole change a bug rather than a
    // fix. The exclusion is one branch in `ignoredFor()`, and a branch that
    // ran for every target would empty all three files identically — which
    // reads exactly like a working narrow.
    // 1/45/47 before `AIRTABLE_PLAN_PAT` was declared. It is narrowed, so it
    // joins preflight; back then it also routed wherever an ordinary deployed
    // secret does. One key, three counts, each up by exactly one.
    //
    // `AIRTABLE_BASE_ID`'s `narrowed` (2026-08-17) moved preflight ALONE, 2 →
    // 3: it was already routed to the deployed targets, being an ordinary
    // public environment variable, so the marker added a target and not a key.
    //
    // `AIRTABLE_PLAN_PAT`'s `tier: "plan"` then moved staging ALONE, 46 → 45:
    // only the two §3.5 plan jobs read it, and neither runs in staging, so
    // the rendered staging file stops asking anyone to fill it in.
    //
    // The Dog Pack rebrand (dogpack.dev) moved staging and production by two
    // (STUDY_GROUP_FINDER_URL + _CALLBACK), and AIRTABLE_SYNC_PAT — moved from
    // Supabase Vault into the platform manifest — by one more (2026-08-19).
    //
    // Then ALL THREE dropped by one: `AIRTABLE_BASE_ID` became a committed
    // constant with `scope: "default"`, which is pushed nowhere. Unlike every
    // move above it, this one is a key leaving the routing entirely rather
    // than changing which targets it reaches — so the three counts move
    // together, and a change that moved only preflight would mean the marker
    // came off without the scope change.
    expect(target("preflight").active.size).toBe(2);
    expect(target("staging").active.size).toBe(47);
    expect(target("production").active.size).toBe(50);
  });

  it("says in the file itself why it is short, and that nothing is hand-set", () => {
    // A three-line env file looks like a broken generator. The header has to
    // claim the shortness, or the next person "fixes" it by pasting the other
    // 43 keys back in.
    const text = renderInit("preflight", DATE);
    expect(text).toContain("PREFLIGHT IS DELIBERATELY TINY");
    expect(text).toMatch(/Airtable PAT/);
    // ⚠️ THE INSTRUCTION THAT HAD TO GO. Until 2026-08-17 this header said
    // AIRTABLE_BASE_ID was "NOT here" and told the reader to set a REPOSITORY
    // variable by hand — visible to every environment, and wider than the
    // routing it stood in for.
    //
    // The key is genuinely absent again now, and the distinction matters
    // enough to keep both assertions: it is absent because the value is a
    // committed constant, NOT because a human is expected to go and set it
    // somewhere. The old instruction must never come back on the strength of
    // "the key is missing from this file again".
    expect(text).not.toContain("AIRTABLE_BASE_ID is NOT here");
    expect(text).not.toMatch(/REPOSITORY variable/);
    expect(text).not.toMatch(/^AIRTABLE_BASE_ID=/m);
    expect(text).toMatch(/committed constant/);
    // POSITIVE CONTROL: the key that was always here still renders, so the
    // line above is an absence rather than a generator that stopped emitting.
    expect(text).toMatch(/^AIRTABLE_PLAN_PAT=""$/m);
    expect(text).not.toMatch(/^SUPABASE_JWT_SIGNING_KEY=/m);
    // And the count in the prose agrees with the body, plural and all.
    expect(text).toContain("The 2 keys a");
  });
});

describe("across the targets", () => {
  it("gives production the apply-tier credentials and staging none", () => {
    const apply = applyOnlyKeys();
    // Not a hardcoded pair: the point is that the tier routes, not which two
    // keys carry it today.
    expect(apply.length).toBeGreaterThan(0);

    const staging = mentioned(target("staging"));
    const preflight = mentioned(target("preflight"));
    const production = mentioned(target("production"));

    for (const key of apply) {
      expect(staging.has(key), `${key} in .env.staging`).toBe(false);
      expect(preflight.has(key), `${key} in .env.preflight`).toBe(false);
      expect(production.has(key), `${key} in .env.production`).toBe(true);
    }
  });

  it("stops rendering all three targets byte-identically", () => {
    // The shape of the original bug: three files that differed only in their
    // header, so whatever was wrong for one was wrong for all of them.
    const staging = renderInit("staging", DATE);
    const production = renderInit("production", DATE);
    expect(staging).not.toBe(production);

    // And the difference is in the BODY, not just the header line: the three
    // used to differ by exactly two lines of prose.
    expect(bodyOf(staging)).not.toBe(bodyOf(production));
  });
});

// ── the path this change must not touch ──────────────────────────────────────

describe("development", () => {
  it("renders the same body as .env.example", () => {
    // The tightest pin available: `.env.example` is byte-compared in CI
    // (`pnpm devtools env example --check`), so tying the development file to it means
    // any drift in either shows up in one of the two checks.
    expect(bodyOf(renderInit("development", DATE))).toBe(
      bodyOf(renderExample()),
    );
  });

  it("keeps the development defaults, which are correct there", () => {
    const { active } = development();
    expect(active.get("BASE_URL")).toBe("http://localhost:3000");
    expect(active.get("SCHEDULE_BUILDER_URL")).toBe("http://localhost:3001");
    expect(active.get("GH_APP_ID")).toBe("000000");
  });

  it("keeps the commented keys commented", () => {
    // The other half of the `commented: true` decision: the flag still means
    // what it says in the one file the Supabase CLI reads, where an empty
    // value for an enabled OAuth provider is a `ProjectConfigParseError` and
    // nothing pushes the file anywhere.
    const file = development();
    const declared = commentedByDeclaration();

    expect(declared.length).toBeGreaterThan(0);
    for (const key of declared) {
      expect(file.commented.has(key), `${key} should stay commented`).toBe(
        true,
      );
      expect(file.active.has(key), `${key} should not be assignable`).toBe(
        false,
      );
    }
  });

  it("keeps every declared key, including the ones no target carries", () => {
    const file = mentioned(development());
    // The never-store and minted keys are excluded because they get
    // documentation and NO assignable line anywhere — asserted separately
    // below. The overlap this guarded against was `AIRTABLE_PAT`, both
    // `scope: developer` and never-store, which would otherwise have been
    // expected in two contradictory places; it has since been removed, and the
    // filter stays because the next key in that position should not have to
    // rediscover the clash.
    const withoutLines = new Set([...mintedKeys(), ...neverStoreKeys()]);
    for (const key of [
      ...scoped("default"),
      ...scoped("developer"),
      ...applyOnlyKeys(),
    ].filter((key) => !withoutLines.has(key))) {
      expect(file.has(key), `${key} belongs in the development file`).toBe(
        true,
      );
    }
    // Minted keys keep documentation and no line of any kind: there is no
    // value to paste, and a hand-pasted one would never rotate.
    for (const key of mintedKeys()) {
      expect(file.has(key), `${key} must have no assignable line`).toBe(false);
      expect(renderInit("development", DATE)).toContain(`# ${key}:`);
    }
    // Never-store keys ship COMMENTED (since 2026-08-19): never in any
    // remote store — push refuses them by name — but the operator's own
    // .env may hold one, and the commented line is the documented home the
    // BWS prompts' save offer revives.
    const parsed = development();
    for (const key of neverStoreKeys()) {
      expect(parsed.active.has(key), `${key} must not ship active`).toBe(false);
      expect(parsed.commented.has(key), `${key} ships commented`).toBe(true);
    }
  });
});

describe("the project picker's rendering", () => {
  // The picker itself is a TTY prompt; what is testable — and what carries
  // the security property — is the selection arithmetic and the render.
  const SB = new Set(["schedule-builder", "supabase"]);

  it("keeps the shared infrastructure a chosen app boots on", () => {
    const keys = keysForSections(SB);
    // API_URL is declared by platform AND schedule-builder; picking either
    // side must keep it, or the narrowed file loses the connection block.
    expect(keys.has("API_URL")).toBe(true);
    // The supabase section rides along with any choice (the caller adds it).
    expect(keys.has("PROJECT_REF")).toBe(true);
  });

  it("drops the unchosen app's keys and the operator tooling", () => {
    const keys = keysForSections(SB);
    expect(keys.has("DISCORD_TOKEN")).toBe(false);
    // devtools is a ROLE, not implied by any app choice.
    expect(keys.has("CLOUDFLARE_API_TOKEN")).toBe(false);
    expect(keys.has("BWS_ACCESS_TOKEN")).toBe(false);
  });

  it("includes the operator tooling only when the role is picked", () => {
    const keys = keysForSections(new Set([...SB, "devtools"]));
    expect(keys.has("CLOUDFLARE_API_TOKEN")).toBe(true);
  });

  it("renders a narrowed development file that says it is narrowed", () => {
    const text = renderInit("development", DATE, SB);
    expect(text).toMatch(/Narrowed to: schedule-builder, supabase/);
    expect(text).toContain("SCHEDULE_BUILDER_URL");
    expect(text).not.toContain("DISCORD_TOKEN");
    expect(text).not.toContain("CLOUDFLARE_API_TOKEN");
  });

  it("renders the full file, with no narrowed banner, when nothing narrows", () => {
    // Every pre-picker caller — and every pipe with no terminal — lands here,
    // so "no sections" has to mean exactly what init always meant.
    const text = renderInit("development", DATE);
    expect(text).not.toContain("Narrowed to:");
    expect(text).toContain("DISCORD_TOKEN");
  });

  it("resolveSections parses --apps and implies supabase", async () => {
    const sections = await resolveSections("schedule-builder,devtools");
    expect(sections).toEqual(
      new Set(["schedule-builder", "devtools", "supabase"]),
    );
  });

  it("resolveSections refuses a section that is not an app or the role", async () => {
    // `supabase` is refused as an OPTION precisely because it is implied —
    // accepting it would teach people it is optional.
    await expect(resolveSections("supabase")).rejects.toThrow(/not a section/);
    await expect(resolveSections("platfrom")).rejects.toThrow(/not a section/);
  });

  it("resolveSections answers everything when nobody can be asked", async () => {
    // vitest has no TTY on stdin, which IS the pipe case.
    expect(await resolveSections()).toBeUndefined();
  });
});
