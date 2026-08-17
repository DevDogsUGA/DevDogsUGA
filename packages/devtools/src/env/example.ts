/**
 * `pnpm devtools env example [--check]` and `pnpm devtools env init`.
 *
 * `.env.example` used to be the file everybody edited and nobody trusted —
 * the fourth of the four files a new variable had to be added to, and the one
 * whose omission nothing caught. Now it is OUTPUT: the registry the manifests
 * populate is the single source, this module renders it, and CI's `--check`
 * fails on drift the same way it does for `database.types.ts`. Editing the
 * generated file by hand is therefore always wrong; the fix goes in the
 * owning manifest's `doc`/`example`/`commented` metadata.
 *
 * ⚠️ Registry-only, on purpose. Nothing here touches Bitwarden, GitHub, the
 * network, or the ambient environment — `cli.ts` dispatches these two
 * subcommands before any token lookup or environment prompt — because the CI
 * job that runs `--check` is deliberately credential-free, and a generator
 * that needed a secret to describe the secrets would not be allowed there.
 *
 * `env init` is the same renderer pointed at a real env file. It takes any
 * `--target` and writes THAT target's file — `.env`, `.env.preflight`,
 * `.env.staging` or `.env.production` — from the one target table, which is
 * the same table `pull`, `push` and `audit` now default their file from. When
 * `init` mapped target → file and `push` did not, `init --env staging` created
 * `.env.staging` and `push --env staging` uploaded `.env`.
 *
 * ⚠️ A VAULT TARGET'S FILE IS NOT THE DEVELOPMENT ONE WITH A DIFFERENT NAME,
 * and rendering it as though it were produced a file that was worse than
 * useless: fill in its blanks, push it, and localhost URLs and a placeholder
 * GitHub App private key went to production — after which `env audit` reported
 * NO DRIFT, because the stored values matched the file they came from. Two
 * differences, both mechanical:
 *
 *   * **Which keys.** `keysRoutedTo()` — what a push for that target would
 *     actually carry somewhere. Not the committed `scope: "default"`
 *     constants, not one contributor's `scope: "developer"` values, and not
 *     the apply-tier credentials outside production, all three of which used
 *     to ship in all three files because all three files were byte-identical
 *     but for the header. `preflight` is narrower again — a target no app boots
 *     from carries only the keys declared `narrowed` — so its file is one line
 *     long today rather than 45.
 *   * **Which values.** Blank, unless `derivationOf()` says the `example` is a
 *     derivation AND every variable it expands from is in the same file. A
 *     development default and a placeholder are both non-empty, and every
 *     consumer downstream skips only EMPTY values.
 *
 * Nothing is commented out in one either, `commented: true` included. That
 * flag encodes a real distinction — an EMPTY value for an enabled OAuth
 * provider makes the Supabase CLI fail with `ProjectConfigParseError`, so
 * "unset" and "empty" are genuinely different states — but not one this file
 * can act on. `push` skips an empty value and never sees a commented line at
 * all, so the two states are the same to it, while a value typed on a
 * commented line is silently NOT pushed. In a file whose entire purpose is to
 * be filled in and pushed, that turns the flag from a safeguard into a trap:
 * `SUPABASE_DB_PASSWORD`, `SUPABASE_JWT_SIGNING_KEY`, `CLOUDFLARE_API_TOKEN`
 * and all four OAuth client secrets shipped commented, i.e. the must-fill keys
 * were the ones that could not be filled. They ship uncommented here; the flag
 * still governs `.env.example` and the development `.env`, where the CLI reads
 * the file and nothing pushes it.
 *
 * It REFUSES to touch an existing file, with no `--force` and no prompt: every
 * other write in this toolchain comments out rather than deletes and confirms
 * before overwriting, and "replace my whole env file with blanks" has no
 * legitimate use — `env reset` blanks values recoverably, `env pull` updates
 * them in place.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { log, note } from "@clack/prompts";
import {
  derivationOf,
  envReferences,
  fileFor,
  isVaultTarget,
  variables,
  type EnvTarget,
  type EnvEntry,
  type EnvMeta,
  type VaultTarget,
} from "@devdogsuga/env";
import { assertRegistryLoaded } from "./discovery.js";
import { keysRoutedTo } from "./selection.js";
import { PROJECT_ROOT } from "../instance.js";
import { explain } from "../ui.js";

/**
 * Section order is FIXED here rather than inherited from manifest import
 * order, and a key declared by several manifests is rendered once, under the
 * earliest of its sources in this list. Both choices serve the same property:
 * the output is a pure function of the declarations, so `--check` compares
 * content rather than filesystem enumeration accidents.
 */
const SECTION_ORDER = [
  "platform",
  "schedule-builder",
  "study-group-finder",
  "sandbox",
  "supabase",
  "devtools",
] as const;

const SECTION_LABELS: Record<string, string> = {
  platform: "platform (apps/platform/src/env.ts)",
  "schedule-builder": "schedule-builder (apps/schedule-builder/src/env.ts)",
  "study-group-finder": "study-group-finder (apps/study-group-finder/env.ts)",
  sandbox:
    "sandbox — the proxy Worker's bindings and what mints them (apps/sandbox/env.ts)",
  supabase:
    "supabase — read by config.toml and the Supabase CLI (supabase/env.ts)",
  devtools:
    "devtools — operator tooling, no app reads these (packages/devtools/env.ts)",
};

/** `study-group-finder:tooling` and friends fold into their app's section. */
function sectionOf(source: string): string {
  return source.split(":")[0]!;
}

function sectionRank(source: string): number {
  const index = (SECTION_ORDER as readonly string[]).indexOf(sectionOf(source));
  return index === -1 ? SECTION_ORDER.length : index;
}

/** Greedy wrap into `# `-prefixed lines that stay under 80 columns. */
function comment(text: string, width = 77): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line !== "" && line.length + 1 + word.length > width) {
      lines.push(`# ${line}`);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") lines.push(`# ${line}`);
  return lines;
}

const RULE = `# ${"-".repeat(75)}`;

interface Block {
  entry: EnvEntry;
  /** Other sections declaring the same key, for the "(shared with …)" note. */
  sharedWith: string[];
}

/** One block per key, grouped by owning section, in declaration order. */
function sections(): { name: string; blocks: Block[] }[] {
  assertRegistryLoaded();
  const bySection = new Map<string, Block[]>();

  for (const entries of variables().values()) {
    // The stable sort keeps declaration order among same-section duplicates,
    // so the owner is the canonical section's own declaration.
    const owner = [...entries].sort(
      (a, b) => sectionRank(a.source) - sectionRank(b.source),
    )[0]!;
    const own = sectionOf(owner.source);
    const sharedWith = [
      ...new Set(
        entries.map((e) => sectionOf(e.source)).filter((s) => s !== own),
      ),
    ];

    const blocks = bySection.get(own) ?? [];
    blocks.push({ entry: owner, sharedWith });
    bySection.set(own, blocks);
  }

  return [...bySection.entries()]
    .sort(([a], [b]) => sectionRank(a) - sectionRank(b) || a.localeCompare(b))
    .map(([name, blocks]) => ({ name, blocks }));
}

/**
 * The value a vault target's file carries for a key: a derivation, or nothing.
 *
 * `routed` is the rest of the file, and passing it is the whole check. A
 * formula is only a value if the file can expand it — `$BASE_URL/auth/callback`
 * with no `BASE_URL` line above it is not "structure worth keeping", it is a
 * literal dollar sign about to be pushed to Bitwarden, stored, synced to
 * GitHub, and written into a deployed environment verbatim.
 */
function derivedValue(meta: EnvMeta, routed: ReadonlySet<string>): string {
  const derivation = derivationOf(meta);
  if (derivation === null) return "";
  return envReferences(derivation).every((ref) => routed.has(ref))
    ? derivation
    : "";
}

/**
 * `routed` is absent for `.env.example` and the development `.env` — the two
 * renderings that want every declared key, with its `example` as written —
 * and present for a vault target, where it is both the filter and the set a
 * derivation's references have to resolve within.
 */
function renderBlock(
  { entry, sharedWith }: Block,
  routed?: ReadonlySet<string>,
): string[] {
  const { key, meta } = entry;
  const lines = comment(meta.doc);

  // Development-only, and actively misleading in a deployed file: staging has
  // no local stack to supply anything, which is why the five keys carrying
  // this flag are still in `variableKeys()` and still land here.
  if (meta.localStack && routed === undefined) {
    lines.push(
      "# (the running local Supabase stack supplies this via .env.generated)",
    );
  }
  if (sharedWith.length > 0) {
    lines.push(`# (shared with ${sharedWith.join(", ")})`);
  }

  // A never-store credential gets documentation and NO assignable line: a
  // `BWS_ACCESS_TOKEN=` line in an example file invites exactly the mistake
  // its doc warns about. The key name still appears, so grep finds it.
  if (meta.secrecy === "never-store") {
    return [
      `# ${key}:`,
      ...lines,
      ...comment(
        `(no ${key}= line on purpose — an assignable line here would invite ` +
          "storing what must not be stored)",
      ),
    ];
  }

  // A minted credential gets the same treatment, for a different reason. There
  // is no value to write: it is signed at deploy time and lives only on the
  // deploy target. A blank `SANDBOX_PROXY_TOKEN=` line would read as a field
  // awaiting a paste, and the paste would be a hand-made token that never
  // rotates — the exact failure minting exists to remove.
  if (meta.minted) {
    return [
      `# ${key}:`,
      ...lines,
      ...comment(
        `(no ${key}= line on purpose — this one is minted at deploy time, so ` +
          "there is no value to fill in and a hand-pasted one would never " +
          "rotate)",
      ),
    ];
  }

  // A vault target's file: a derivation or a blank, always assignable. See the
  // module header for why `commented` stops applying here and why every other
  // `example` is dropped rather than carried across.
  if (routed !== undefined) {
    lines.push(`${key}="${derivedValue(meta, routed)}"`);
    return lines;
  }

  const value = `${key}="${meta.example ?? ""}"`;
  // `developer` keys are always commented: they are one contributor's own
  // values, and an uncommented empty line reads as a blank everybody fills in.
  const commented = meta.commented === true || meta.scope === "developer";
  lines.push(commented ? `# ${value}` : value);
  return lines;
}

/**
 * `routed` absent renders every declared key; present renders that set only.
 *
 * A section whose keys are all filtered out is dropped with them. A heading
 * over nothing reads as "this app needs nothing here", which is a different
 * and false claim.
 */
function renderBody(routed?: ReadonlySet<string>): string[] {
  const lines: string[] = [];
  for (const { name, blocks } of sections()) {
    const included =
      routed === undefined
        ? blocks
        : blocks.filter(({ entry }) => routed.has(entry.key));
    if (included.length === 0) continue;

    lines.push("", RULE, `# ${SECTION_LABELS[name] ?? name}`, RULE);
    for (const block of included) {
      lines.push("", ...renderBlock(block, routed));
    }
  }
  return lines;
}

/** The committed `.env.example`: generated header + rendered registry. */
export function renderExample(): string {
  const header = [
    "# .env.example — every declared environment variable, with its documentation.",
    "#",
    "# GENERATED by `pnpm devtools env example`. Do not edit this file: edit",
    "# the owning manifest (src/env.ts, env.ts, supabase/env.ts) and regenerate.",
    "# CI runs `env example --check` and fails on drift, the same pattern as",
    "# database.types.ts.",
    "#",
    "# One env file per target, each standalone — no shared base, so a key",
    "# missing from a deployed file is a loud validation error rather than a",
    "# silent fallthrough to a development value:",
    "#",
    "#   .env             IS development (the unsuffixed file, read by default)",
    "#   .env.preflight   `pnpm devtools env pull --target preflight`",
    "#   .env.staging     `pnpm devtools env pull --target staging`",
    "#   .env.production  `pnpm devtools env pull --target production`",
    "#",
    "# .env.preflight is a staging area for pushing credentials, never a file an",
    "# app boots from: DEPLOY_ENV=preflight is refused on purpose.",
    "#",
    "# `pnpm devtools setup` (or `pnpm devtools env init`) materialises a",
    "# fresh .env from the same registry that generated this file. The local",
    "# Docker stack is detected by a port probe, not a flag: while it is running,",
    "# .env.generated (written by start-local-stack) overlays the connection",
    "# block — in development only. `supabase stop` is the toggle back.",
  ];
  return [...header, ...renderBody(), ""].join("\n");
}

/** The prose above a vault target's blanks, explaining why they are blank. */
function targetHeader(target: VaultTarget, count: number): string[] {
  return [
    "#",
    ...comment(
      `The ${count} key${count === 1 ? "" : "s"} a ` +
        `\`pnpm devtools env push --target ${target}\` ` +
        "routes, and nothing else. The committed defaults and the " +
        "per-developer values go nowhere, and a minted credential is signed " +
        "at deploy time rather than stored, so none of the three has a line " +
        "here to fill in.",
    ),
    "#",
    ...comment(
      target === "production"
        ? "The apply-tier credentials ARE here — SUPABASE_ACCESS_TOKEN and " +
            "AIRTABLE_APPLY_PAT reach the production-apply GitHub " +
            "environment, and no other target carries them."
        : "The apply-tier credentials are NOT here. They exist to reshape " +
            `production, so a copy in ${target} would be a second ` +
            "write-capable token to rotate for no benefit — and `env push` " +
            "skips them outside production anyway.",
    ),
    "#",
    ...comment(
      "Fill the values in, or run " +
        `\`pnpm devtools env pull --target ${target}\` to fetch what ` +
        "Bitwarden already holds. Nothing is commented out: push reads " +
        "assignments, and a commented line is not one — a value typed on it " +
        "would be silently skipped.",
    ),
    "#",
    ...comment(
      "The blanks are blank ON PURPOSE. A key's `example` metadata is a " +
        "development default (`http://localhost:3000`) or an .env.example " +
        "placeholder (`000000`, a fake private key), and every consumer " +
        "downstream skips only EMPTY values — so a prefilled one would push " +
        "cleanly and then be reported as no drift, because the stored value " +
        "would match this file. The `$VAR` lines that DID survive are " +
        "derivations: how the value is built, from another line in this same " +
        "file. Leave them alone unless the target genuinely differs.",
    ),
    ...(target === "preflight"
      ? [
          "#",
          ...comment(
            "⚠️ PREFLIGHT IS DELIBERATELY TINY, and a short file here is the " +
              "correct output rather than a truncated one. Nothing boots from " +
              "this target: it exists to feed CI's migration and schema DRY " +
              "RUNS, which read and change nothing, so it carries only the " +
              "keys whose declaration opts in with `narrowed` — each of which " +
              "is narrow enough for a dry run and no wider: a Postgres role " +
              "that sees only the migrations table, and an Airtable PAT with " +
              "`schema.bases:read` on one base. Every other key is absent ON " +
              "PURPOSE: this project's GitHub environment is reachable from " +
              "`main`, and it used to list all 45 routable keys, the JWT " +
              "signing key included.",
          ),
          "#",
          ...comment(
            "⚠️ AIRTABLE_BASE_ID is NOT here, and `deploy airtable-plan` " +
              "needs it. It is public rather than secret, so it is a GitHub " +
              "VARIABLE — and it is declared without `narrowed`, so a push " +
              "for this target does not route it. Set it as a REPOSITORY " +
              "variable, which every environment sees, including this one.",
          ),
        ]
      : []),
  ];
}

/**
 * A fresh env file for `env init`.
 *
 * Two renderings, not one with a different first line — see the module header.
 * `development` wants every declared key with its `example` as written, which
 * is also what `.env.example` wants; a vault target wants what a push for that
 * target routes, blank unless the registry can derive it.
 */
export function renderInit(target: EnvTarget, date: string): string {
  const file = fileFor(target);
  const stamp = `# ${file} (${target}) — created by \`pnpm devtools env init\` on ${date}.`;

  if (isVaultTarget(target)) {
    const routed = keysRoutedTo(target);
    return [
      stamp,
      ...targetHeader(target, routed.size),
      ...renderBody(routed),
      "",
    ].join("\n");
  }

  return [
    stamp,
    "# Fill in the values below. The local Supabase stack supplies the whole",
    "# connection block: `pnpm devtools link` starts it and writes",
    "# .env.generated, which overlays this file while the stack is running.",
    ...renderBody(),
    "",
  ].join("\n");
}

// ── commands ─────────────────────────────────────────────────────────────────

const EXAMPLE_PATH = ".env.example";

/** `KEY=`, `# KEY=` — the assignable (or deliberately commented) lines. */
const ASSIGNMENT = /^(#\s?)?([A-Z][A-Z0-9_]*)=.*$/;

/** key → full line, for the key-level diff summary. */
function assignments(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = ASSIGNMENT.exec(line);
    if (match && !map.has(match[2]!)) map.set(match[2]!, line);
  }
  return map;
}

export async function runEnvExample(options: {
  check?: boolean;
}): Promise<void> {
  const path = resolve(PROJECT_ROOT, EXAMPLE_PATH);
  const generated = renderExample();

  if (!options.check) {
    await writeFile(path, generated);
    log.success(
      `Wrote ${EXAMPLE_PATH} from the registry ` +
        `(${assignments(generated).size} assignable keys).`,
    );
    return;
  }

  const committed = await readFile(path, "utf8").catch(() => null);
  if (committed === generated) {
    log.success(`${EXAMPLE_PATH} matches the env manifests.`);
    return;
  }

  // Key-level, not a full diff: the file is mostly prose, and the useful
  // answer is WHICH declarations moved, not a wall of comment churn.
  const ours = assignments(generated);
  const theirs =
    committed === null ? new Map<string, string>() : assignments(committed);
  const drift: string[] = [];
  for (const key of ours.keys()) {
    if (!theirs.has(key))
      drift.push(`+ ${key}  declared, missing from ${EXAMPLE_PATH}`);
    else if (theirs.get(key) !== ours.get(key))
      drift.push(`~ ${key}  line differs`);
  }
  for (const key of theirs.keys()) {
    if (!ours.has(key))
      drift.push(`- ${key}  in ${EXAMPLE_PATH}, no longer generated`);
  }
  if (drift.length === 0) {
    drift.push("(no key drifted — the header or a doc comment changed)");
  }

  note(drift.join("\n"), `${EXAMPLE_PATH} is out of date`);
  explain(`${EXAMPLE_PATH} does not match the env manifests.`, "", [
    "Regenerate it with `pnpm devtools env example` and commit the result.",
    "The manifests are the source of truth; never edit the file by hand.",
  ]);
  process.exitCode = 1;
}

export async function runEnvInit(target: EnvTarget): Promise<void> {
  const file = fileFor(target);
  const path = resolve(PROJECT_ROOT, file);
  const date = new Date().toISOString().slice(0, 10);

  try {
    // `wx` makes the existence check and the write one atomic operation, so
    // two concurrent inits cannot both pass a stat and then clobber.
    await writeFile(path, renderInit(target, date), { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      explain(`${file} already exists, and init never overwrites.`, "", [
        target === "development"
          ? "Edit .env in place, or `pnpm devtools env reset` blanks every" +
            " value while keeping each recoverable as a comment."
          : `\`pnpm devtools env pull --target ${target}\` updates its` +
            " values in place.",
        "To start truly fresh, move the old file aside yourself first — that",
        "way discarding it is your action, not this tool's.",
      ]);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  log.success(`Created ${file} (${target}).`);
  log.info(
    target === "development"
      ? "Fill in the values, or run `pnpm devtools link` to start the local " +
          "stack — it supplies the whole connection block via .env.generated."
      : "Every value is blank but the `$VAR` derivations, which are how those " +
          "values are built rather than a guess at them. " +
          `\`pnpm devtools env pull --target ${target}\` fills the rest from ` +
          "Bitwarden.",
  );
}
