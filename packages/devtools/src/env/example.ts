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
 * `env init` is the same renderer pointed at a real env file, minus the
 * generated-file header. It takes any `--target` and writes THAT target's file
 * — `.env`, `.env.preflight`, `.env.staging` or `.env.production` — from the
 * one target table, which is the same table `pull`, `push` and `audit` now
 * default their file from. When `init` mapped target → file and `push` did
 * not, `init --env staging` created `.env.staging` and `push --env staging`
 * uploaded `.env`.
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
  fileFor,
  variables,
  type EnvTarget,
  type EnvEntry,
} from "@devdogsuga/env";
import { assertRegistryLoaded } from "./discovery.js";
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

function renderBlock({ entry, sharedWith }: Block): string[] {
  const { key, meta } = entry;
  const lines = comment(meta.doc);

  if (meta.localStack) {
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

  const value = `${key}="${meta.example ?? ""}"`;
  // `developer` keys are always commented: they are one contributor's own
  // values, and an uncommented empty line reads as a blank everybody fills in.
  const commented = meta.commented === true || meta.scope === "developer";
  lines.push(commented ? `# ${value}` : value);
  return lines;
}

function renderBody(): string[] {
  const lines: string[] = [];
  for (const { name, blocks } of sections()) {
    lines.push("", RULE, `# ${SECTION_LABELS[name] ?? name}`, RULE);
    for (const block of blocks) {
      lines.push("", ...renderBlock(block));
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

/** A fresh env file for `env init` — same body, working-file header. */
export function renderInit(target: EnvTarget, date: string): string {
  const file = fileFor(target);
  const header = [
    `# ${file} (${target}) — created by \`pnpm devtools env init\` on ${date}.`,
    ...(target === "development"
      ? [
          "# Fill in the values below. The local Supabase stack supplies the whole",
          "# connection block: `pnpm devtools link` starts it and writes",
          "# .env.generated, which overlays this file while the stack is running.",
        ]
      : [
          `# Run \`pnpm devtools env pull --target ${target}\` to fill the`,
          "# values from Bitwarden, or fill them in by hand.",
        ]),
  ];
  return [...header, ...renderBody(), ""].join("\n");
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
      : `Every value is blank. \`pnpm devtools env pull --target ${target}\` ` +
          `fills it from Bitwarden.`,
  );
}
