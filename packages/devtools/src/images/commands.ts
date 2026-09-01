/**
 * `pnpm devtools images [graphic…] [--format …] [--out …]`
 *
 * Renders the club's pictures from the templates in `@devdogsuga/og`. Two axes,
 * asked for separately: WHICH picture (`event/2026-09-08`, `page/events`,
 * `app/dogdays`) and at WHAT SIZE (`gdgc-square`, `og`, `icon-512`). That split
 * is the point of the command — an event poster for the GDG on Campus platform
 * is exactly the pairing "this meeting" x "that platform's banner", and it
 * could not be asked for while the two were one hard-coded list.
 *
 * Anything the command line leaves out, it asks for; anything it names, it does
 * not. So an officer can type `pnpm devtools images` and be walked through it,
 * and a script can pass every flag and never see a prompt.
 *
 * Event graphics are the one group backed by a database rather than by files in
 * this repo, and the one group that can therefore be unavailable or out of
 * date. See {@link loadEvents} for what the command says when it is.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { confirm, isTTY, log, note } from "@clack/prompts";
import { FORMATS, type Format } from "@devdogsuga/og";
import { positionals } from "../args.js";
import { adminClient, type Instance } from "../instance.js";
import { errorMessage, explain, unwrap } from "../ui.js";
import {
  describeAge,
  hoursSince,
  STALE_AFTER_HOURS,
  supabaseEvents,
  type EventReader,
} from "./events.js";
import {
  assertUniqueStems,
  eventGraphics,
  staticGraphics,
  type Graphic,
} from "./graphics.js";
import { pickFormats, pickGraphics, pickOutput } from "./prompts.js";
import { render } from "./render.js";
import {
  commaList,
  formatsFor,
  matchGraphics,
  normalizeArgv,
  pair,
  type Selection,
} from "./select.js";

/**
 * The workspace root. Every default directory is written relative to it, and
 * resolving those against `process.cwd()` would put the club's icons wherever
 * the contributor happened to be standing.
 */
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];

  return value && !value.startsWith("--") ? value : undefined;
}

export interface ImagesOptions {
  /** Graphic patterns. Empty means ask. */
  patterns: string[];
  /** Format names. Empty with `allFormats` false means ask. */
  formats: string[];
  allFormats: boolean;
  /** An explicit directory; everything lands in it, flat. */
  out?: string;
  /** Use each graphic's own default directory. */
  defaultOut: boolean;
  /** List what would be written, and write nothing. */
  noOutput: boolean;
}

export function parseImagesArgs(argv: readonly string[]): ImagesOptions {
  const normalized = normalizeArgv(argv);

  return {
    patterns: positionals(normalized),
    formats: commaList(flagValue(normalized, "--format")),
    allFormats: normalized.includes("--all-formats"),
    out: flagValue(normalized, "--out"),
    defaultOut: normalized.includes("--default-out"),
    noOutput: normalized.includes("--no-output"),
  };
}

/** `~/images` when the shell did not expand it, which quoting prevents. */
export function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/")
    ? resolve(homedir(), path.slice(2))
    : path;
}

/** Whether anything asked for could be an event, so whether to reach for a database. */
export function wantsEvents(patterns: readonly string[]): boolean {
  // No pattern means the picker, and the picker should list meetings.
  if (patterns.length === 0) return true;

  return patterns.some(
    (pattern) =>
      pattern === "*" ||
      pattern === "*/*" ||
      pattern === "event" ||
      pattern.startsWith("event/"),
  );
}

/** Whether a pattern names events specifically, rather than sweeping them up. */
export function namesEvents(patterns: readonly string[]): boolean {
  return patterns.some(
    (pattern) => pattern === "event" || pattern.startsWith("event/"),
  );
}

export interface ImagesDeps {
  /** Resolves the database, printing its own diagnosis on failure. */
  connect: () => Promise<Instance | null>;
  /** Overridden in tests so nothing opens a socket. */
  reader?: (instance: Instance) => EventReader;
}

/**
 * Meetings, or a clear account of why there are none.
 *
 * The database is the one dependency of this command that a contributor cannot
 * see, so every failure here says which database it looked at and what to run.
 * Two failures, treated differently, matching what each one means:
 *
 *   - **Unreachable, under a wildcard.** `images *` means "everything", and
 *     everything else is renderable. It renders, and reports the events it
 *     could not.
 *   - **Unreachable, named.** `images 'event/*'` asked for exactly the thing
 *     that is missing. Nothing to degrade to, so it fails.
 *
 * A STALE sync is neither: the data is there and may be fine. It warns with the
 * age, and asks — because the images being rendered are usually about to be
 * posted somewhere public, and "these say the meeting is in DLW" is worth one
 * keystroke of doubt. With no terminal to ask, the warning stands and the
 * render proceeds; a build should not stall on a question.
 */
async function loadEvents(
  patterns: readonly string[],
  deps: ImagesDeps,
): Promise<{ graphics: Graphic[]; skipped: string | null }> {
  const required = namesEvents(patterns);
  const instance = await deps.connect();

  if (!instance) {
    if (required) {
      throw new Error(
        "Event images come from the database, and there is no database to read.",
      );
    }

    return {
      graphics: [],
      skipped: "no database reachable — run `pnpm devtools link`",
    };
  }

  const reader = (deps.reader ?? ((i) => supabaseEvents(adminClient(i))))(
    instance,
  );

  let meetings;
  let state;
  try {
    [state, meetings] = await Promise.all([
      reader.syncState(),
      reader.meetings(),
    ]);
  } catch (err) {
    if (required) throw err;

    return { graphics: [], skipped: errorMessage(err) };
  }

  const age = hoursSince(state?.lastSyncedAt ?? null);

  if (age === null) {
    log.warn(
      "This database has never synced from Airtable, so its meetings are whatever the seeds put there.",
    );
  } else if (age > STALE_AFTER_HOURS) {
    log.warn(
      `Airtable last synced ${describeAge(age)} ago` +
        `${state?.lastStatus ? ` (${state.lastStatus}` : ""}` +
        `${state?.rowsRefused ? `, ${state.rowsRefused} refused)` : state?.lastStatus ? ")" : ""}` +
        ". Meeting details may be out of date.",
    );

    if (isTTY(process.stdout)) {
      const proceed = unwrap(
        await confirm({
          message: "Render from it anyway?",
          initialValue: true,
        }),
      );
      if (!proceed) throw new Error("Stopped, so the sync can be run first.");
    }
  }

  return { graphics: eventGraphics(meetings), skipped: null };
}

/** Where one selection is written. */
export function destinationOf(
  { graphic, format }: Selection,
  out: string | undefined,
): string {
  if (out) {
    // Flat, and always `<stem>-<format>.png`: the pinned filenames a graphic
    // uses in its own directory (`icon.png`, `opengraph-image.png`) are only
    // unambiguous BECAUSE the directories differ. Side by side they collide.
    return resolve(expandHome(out), `${graphic.stem}-${format.name}.png`);
  }

  const { dir, file } = graphic.destination(format);

  return resolve(REPO_ROOT, dir, file);
}

/** Repo-relative where possible, so the log reads as paths in this project. */
function display(file: string): string {
  const rel = relative(REPO_ROOT, file);

  return rel.startsWith("..") || isAbsolute(rel) ? file : rel;
}

export async function runImages(
  argv: string[],
  deps: ImagesDeps,
): Promise<void> {
  const options = parseImagesArgs(argv);

  if (options.out && options.defaultOut) {
    explain(
      "Two answers to one question.",
      "--out names a directory and --default-out says to use each graphic's own.",
      [
        "pnpm devtools images 'event/*' --out ~/images",
        "pnpm devtools images '*' --default-out",
      ],
    );
    process.exitCode = 1;
    return;
  }

  try {
    await images(options, deps);
  } catch (err) {
    explain("Could not render that.", errorMessage(err), [
      "pnpm devtools images                      # pick from a list",
      "pnpm devtools images 'event/*' --all-formats --out ~/images",
      "pnpm devtools images '*' --default-out",
    ]);
    process.exitCode = 1;
  }
}

async function images(options: ImagesOptions, deps: ImagesDeps): Promise<void> {
  // ── Which pictures ────────────────────────────────────────────────────────
  const registry = staticGraphics();
  let skipped: string | null = null;

  if (wantsEvents(options.patterns)) {
    const events = await loadEvents(options.patterns, deps);
    registry.push(...events.graphics);
    skipped = events.skipped;
  }

  assertUniqueStems(registry);

  const graphics =
    options.patterns.length === 0
      ? await pickGraphics(registry)
      : resolvePatterns(options.patterns, registry);

  if (graphics.length === 0) {
    throw new Error("Nothing to render.");
  }

  // ── At what sizes ─────────────────────────────────────────────────────────
  const requested = options.allFormats
    ? formatsFor(graphics).map((format) => format.name)
    : options.formats.length > 0
      ? options.formats
      : await pickFormats(graphics);

  const unknown = requested.filter((name) => !FORMATS[name]);
  if (unknown.length > 0) {
    throw new Error(
      `No format called ${unknown.join(", ")}. Try one of ${Object.keys(FORMATS).join(", ")}.`,
    );
  }

  const { selections, unsupported } = pair(graphics, requested);

  // Naming one graphic and one format it cannot do is a mistake worth saying
  // out loud; sweeping up combinations that do not exist under a wildcard is
  // not, and reporting every one of those would bury the output.
  if (selections.length === 0 && unsupported.length > 0) {
    throw new Error(
      unsupported
        .map((miss) => `${miss.graphic} has no ${miss.format} rendition`)
        .join("; "),
    );
  }
  if (selections.length === 0) throw new Error("Nothing to render.");

  // ── Where ─────────────────────────────────────────────────────────────────
  const out = options.defaultOut
    ? undefined
    : options.out
      ? options.out
      : options.noOutput
        ? undefined
        : await pickOutput(graphics);

  if (skipped) log.warn(`event graphics skipped — ${skipped}`);

  if (options.noOutput) {
    note(
      selections
        .map(
          (selection) =>
            `${selection.graphic.name}  ${selection.format.name}\n  ${display(destinationOf(selection, out))}\n  ${selection.format.why}`,
        )
        .join("\n"),
      `${selections.length} image${selections.length === 1 ? "" : "s"}`,
    );
    return;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  let bytes = 0;

  for (const selection of selections) {
    const file = destinationOf(selection, out);
    const { png, width, height } = await render(
      selection.graphic.render(selection.format),
      selection.format,
    );

    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, png);
    bytes += png.length;

    log.success(
      `${display(file)}  ${width}x${height}  (${Math.round(png.length / 1024)} KB)`,
    );
  }

  log.info(
    `${selections.length} image${selections.length === 1 ? "" : "s"}, ${Math.round(bytes / 1024)} KB total.`,
  );
}

function resolvePatterns(patterns: string[], registry: Graphic[]): Graphic[] {
  const { matched, unmatched } = matchGraphics(patterns, registry);

  if (unmatched.length === 0) return matched;

  // An event pattern that matched nothing is almost never a typo — it is a
  // database with no meetings in it. Saying "try brand/*, page/*" sends the
  // reader hunting for a spelling mistake that is not there.
  const askedForEvents = unmatched.some(
    (pattern) => pattern === "event" || pattern.startsWith("event/"),
  );
  const haveEvents = registry.some((graphic) => graphic.group === "event");

  if (askedForEvents && !haveEvents) {
    throw new Error(
      "This database has no meetings, so there are no event images to render. " +
        "Sync it from Airtable, or point at a database that has been.",
    );
  }

  const groups = [...new Set(registry.map((graphic) => `${graphic.group}/*`))];

  throw new Error(
    `Nothing called ${unmatched.join(", ")}. Names are group/name — try ` +
      `${groups.join(", ")}, or * for all of them.`,
  );
}

/** Re-exported so `render.ts`'s options type is the format's own shape. */
export type { Format };
