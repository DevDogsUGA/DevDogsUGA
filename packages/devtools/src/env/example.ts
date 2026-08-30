/**
 * `pnpm devtools env example [--check]` and `pnpm devtools env init`.
 *
 * `.env.example` is OUTPUT, not a file anyone edits. The registry the
 * manifests populate is the single source, this module renders it, and CI's
 * `--check` fails on drift the same way it does for `database.types.ts`. A
 * wrong line is fixed in the owning manifest's `doc`/`example`/`commented`
 * metadata.
 *
 * ⚠️ Registry-only, on purpose. Nothing here touches Bitwarden, GitHub, the
 * network, or the ambient environment, and `cli.ts` dispatches these two
 * subcommands before any token lookup or environment prompt. The CI job that
 * runs `--check` is deliberately credential-free, and a generator that needed
 * a secret to describe the secrets would not be allowed there.
 *
 * `env init` is the same renderer pointed at a real env file. It takes any
 * `--target` and writes THAT target's file (`.env`, `.env.preflight`,
 * `.env.staging`, `.env.production`) from the one target table that `pull`,
 * `push` and `audit` default their file from. When `init` mapped target to
 * file and `push` did not, `init --env staging` created `.env.staging` and
 * `push --env staging` uploaded `.env`.
 *
 * ⚠️ A VAULT TARGET'S FILE IS NOT THE DEVELOPMENT ONE WITH A DIFFERENT NAME.
 * Rendering it as though it were produced a file worse than useless: fill in
 * its blanks, push it, and localhost URLs and a placeholder GitHub App private
 * key went to production, after which `env audit` reported NO DRIFT, because
 * the stored values matched the file they came from. Two differences, both
 * mechanical:
 *
 *   * **Which keys.** `keysRoutedTo()`, what a push for that target would
 *     actually carry somewhere. Not the committed `scope: "default"`
 *     constants, not one contributor's `scope: "developer"` values, and not
 *     the apply-tier credentials outside production, all three of which used
 *     to ship in all three files because all three files were byte-identical
 *     but for the header. `preflight` is narrower again: a target no app boots
 *     from carries only the keys declared `narrowed`, so its file is one line
 *     long today rather than 45.
 *   * **Which values.** Blank, unless `derivationOf()` says the `example` is a
 *     derivation AND every variable it expands from is in the same file. A
 *     development default and a placeholder are both non-empty, and every
 *     consumer downstream skips only EMPTY values.
 *
 * Nothing is commented out in one either, `commented: true` included. The flag
 * encodes a real distinction: an EMPTY value for an enabled OAuth provider
 * makes the Supabase CLI fail with `ProjectConfigParseError`, so "unset" and
 * "empty" differ. `push` cannot act on it. It skips an empty value and never
 * sees a commented line at all, so a value typed on a commented line is
 * silently NOT pushed. That made the flag a trap here: `SUPABASE_DB_PASSWORD`,
 * `SUPABASE_JWT_SIGNING_KEY`, `CLOUDFLARE_API_TOKEN` and all four OAuth client
 * secrets shipped commented, so the must-fill keys were the ones that could
 * not be filled. They ship uncommented here; the flag still governs
 * `.env.example` and the development `.env`, where the CLI reads the file and
 * nothing pushes it.
 *
 * It REFUSES to touch an existing file, with no `--force` and no prompt.
 * "Replace my whole env file with blanks" has no legitimate use: `env reset`
 * blanks values recoverably, `env pull` updates them in place.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { log, multiselect, note } from "@clack/prompts";
import { EnvDocument } from "./document.js";
import { unwrap } from "../ui.js";
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
 * order, and a key declared by several manifests renders once, under the
 * earliest of its sources in this list. Both choices keep the output a pure
 * function of the declarations, so `--check` compares content rather than
 * filesystem enumeration accidents.
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

/**
 * The sections a development init may narrow to: the four apps.
 *
 * `supabase` is NOT here and NOT optional. It is the shared database and auth
 * layer every app runs against, so any selection implies it (the caller adds
 * it). `devtools` is not here either, deliberately: it is a ROLE, not a
 * project. A contributor picks what they are building; whether they also
 * operate deploys is a separate question the picker asks separately.
 */
export const APP_SECTIONS = [
  "platform",
  "schedule-builder",
  "study-group-finder",
  "sandbox",
] as const;

/**
 * Every declared key belonging to one of the chosen sections.
 *
 * `some` over a key's declaring sources, so a key SHARED between a chosen and
 * an unchosen app (API_URL, the whole connection block) is included by
 * whichever side was picked. A narrowed file must never lose the
 * infrastructure a chosen app boots on just because another app shares it.
 */
export function keysForSections(chosen: ReadonlySet<string>): Set<string> {
  assertRegistryLoaded();
  const keys = new Set<string>();
  for (const [key, entries] of variables()) {
    if (entries.some((entry) => chosen.has(sectionOf(entry.source)))) {
      keys.add(key);
    }
  }
  return keys;
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
 * formula is only a value if the file can expand it. `$BASE_URL/auth/callback`
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
 * `routed` is absent for `.env.example` and the development `.env`, the two
 * renderings that want every declared key with its `example` as written. It is
 * present for a vault target, where it is both the filter and the set a
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

  // A never-store credential ships COMMENTED. "Never store" is about REMOTE
  // stores: push refuses these by name, pull will not write them back, and
  // audit errors on any remote copy. The operator's own gitignored .env may
  // hold one (since 2026-08-19, by decision), and the BWS prompts offer to
  // save there. The commented line is the documented home that offer revives.
  // A vault target's file never renders these at all, because
  // `keysRoutedTo()` refuses them.
  if (meta.secrecy === "never-store") {
    return [...lines, `# ${key}=""`];
  }

  // A minted credential gets the same treatment, for a different reason. There
  // is no value to write: it is signed at deploy time and lives only on the
  // deploy target. A blank `SANDBOX_PROXY_TOKEN=` line would read as a field
  // awaiting a paste, and the paste would be a hand-made token that never
  // rotates, the exact failure minting exists to remove.
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
 * over nothing reads as "this app needs nothing here", a different and false
 * claim.
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
    "#",
    "# SECTIONS ARE GROUPED BY WHO READS THE VARIABLE, and two of the readers",
    "# are not apps — that is deliberate, not clutter. The four app sections",
    "# come first. Then `supabase`: values config.toml and the Supabase CLI",
    "# read (the shared auth server serves every app, so no one app can own",
    "# them). Then `devtools`: operator credentials no app reads at all. They",
    "# cannot be moved into an app's manifest, because an app's manifest is",
    "# what `deploy secrets-file` uploads to that app's Worker — filing",
    "# CLOUDFLARE_API_TOKEN or an OAuth client secret under an app would put",
    "# it on an internet-facing Worker that never asked for it. A key an app",
    "# only needs at dev/build time uses the `<app>:tooling` suffix instead,",
    "# which keeps the app grouping without the upload.",
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
            "Nothing here is set by hand, and nothing here names the Airtable " +
              "base. The base id was the third key in this file until it " +
              "became a committed constant in `@devdogsuga/airtable`, beside " +
              "the field ids of the same base — so the dry run reads which " +
              "base to plan against out of the checkout rather than out of a " +
              "store somebody has to keep in sync.",
          ),
        ]
      : []),
  ];
}

/**
 * A fresh env file for `env init`.
 *
 * Two renderings, not one with a different first line. See the module header.
 * `development` wants every declared key with its `example` as written, which
 * is also what `.env.example` wants; a vault target wants what a push for that
 * target routes, blank unless the registry can derive it.
 */
export function renderInit(
  target: EnvTarget,
  date: string,
  /**
   * Development only: the sections to render, from the project picker.
   * Callers pass the CHOSEN set plus `supabase` (the shared stack is implied
   * by any choice); absent means everything, which is what the vault targets
   * and every pre-picker caller get.
   */
  sections?: ReadonlySet<string>,
): string {
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

  const narrowed =
    sections &&
    (SECTION_ORDER as readonly string[]).some((s) => !sections.has(s));
  return [
    stamp,
    ...(narrowed
      ? [
          `# Narrowed to: ${[...sections].sort().join(", ")} — the projects picked at`,
          "# init. Nothing else is missing by accident: re-run",
          "# `pnpm devtools env init --target development` any time to add the",
          "# sections for another project (or the operator tooling), appended",
          "# without touching a value you have already filled in.",
        ]
      : []),
    "# Fill in the values below. The local Supabase stack supplies the whole",
    "# connection block: `pnpm devtools link` starts it and writes",
    "# .env.generated, which overlays this file while the stack is running.",
    ...renderBody(sections ? keysForSections(sections) : undefined),
    "",
  ].join("\n");
}

// ── commands ─────────────────────────────────────────────────────────────────

const EXAMPLE_PATH = ".env.example";

/** `KEY=`, `# KEY=`: the assignable (or deliberately commented) lines. */
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

/**
 * The development sections to render: `--apps`, else the picker, else all.
 *
 * `undefined` means "everything", which covers three callers at once: a script
 * with no flag, a pipe with no terminal (the picker refuses to prompt where
 * nobody can answer, like every other picker here), and the vault targets,
 * which never narrow.
 */
export async function resolveSections(
  apps?: string,
): Promise<Set<string> | undefined> {
  if (apps !== undefined) {
    const chosen = apps
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== "");
    const valid: readonly string[] = [...APP_SECTIONS, "devtools"];
    for (const name of chosen) {
      if (!valid.includes(name)) {
        throw new Error(
          `--apps: "${name}" is not a section. Apps: ${APP_SECTIONS.join(", ")}; ` +
            "plus `devtools` for the operator tooling. `supabase` is implied " +
            "by any choice and is not an option.",
        );
      }
    }
    if (chosen.length === 0) return undefined;
    return new Set([...chosen, "supabase"]);
  }

  if (!process.stdin.isTTY) return undefined;

  const chosen = unwrap(
    await multiselect({
      message:
        "Which projects are you working on? (The shared Supabase stack is " +
        "always included; re-run init later to add more.)",
      options: [
        ...APP_SECTIONS.map((app) => ({ value: app as string, label: app })),
        {
          value: "devtools",
          label: "deploy & officer tooling",
          hint: "a role, not an app — operator credentials, all commented out; most contributors never need these",
        },
      ],
      initialValues: [...APP_SECTIONS] as string[],
      required: true,
    }),
  );
  return new Set([...chosen, "supabase"]);
}

export async function runEnvInit(
  target: EnvTarget,
  apps?: string,
): Promise<void> {
  const file = fileFor(target);
  const path = resolve(PROJECT_ROOT, file);
  const date = new Date().toISOString().slice(0, 10);
  const sections =
    target === "development" ? await resolveSections(apps) : undefined;

  try {
    // `wx` makes the existence check and the write one atomic operation, so
    // two concurrent inits cannot both pass a stat and then clobber.
    await writeFile(path, renderInit(target, date, sections), { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      // A development re-run is ADDITIVE: the picker's whole story is "pick
      // less now, come back for more later", and that story needs the later.
      // Only keys the file does not mention at all are appended. An active
      // line holds somebody's value and a commented one holds their decision,
      // and both survive byte-for-byte.
      if (target === "development") {
        const existing = await readFile(path, "utf8");
        const doc = EnvDocument.parse(existing);
        const wanted = sections
          ? keysForSections(sections)
          : new Set(variables().keys());
        const missing = new Set(
          [...wanted].filter((key) => !doc.has(key) && !doc.isCommented(key)),
        );
        if (missing.size === 0) {
          log.info(`${file} already covers that selection — nothing to add.`);
          return;
        }
        const appended = [
          "",
          `# --- added by \`pnpm devtools env init\` on ${date} for: ${
            sections ? [...sections].sort().join(", ") : "everything"
          } ---`,
          ...renderBody(missing),
          "",
        ].join("\n");
        await writeFile(path, existing.replace(/\n?$/, "\n") + appended);
        log.success(
          `Appended ${missing.size} key${missing.size === 1 ? "" : "s"} to ${file}; existing lines untouched.`,
        );
        return;
      }
      explain(`${file} already exists, and init never overwrites.`, "", [
        `\`pnpm devtools env pull --target ${target}\` updates its` +
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
