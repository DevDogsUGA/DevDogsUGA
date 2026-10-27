/**
 * `backstage export <stars|attendance|reflections>`: the platform's CSV
 * downloads, moved here from `/console/exports`.
 *
 *   pnpm backstage export stars --from 2026-08-17 --to 2026-12-12
 *   pnpm backstage export attendance --meeting 2026-09-09 --format bevy,involvement
 *   pnpm backstage export attendance --meeting 2026-09-09 --out -
 *
 * ## Audited, as the downloads were
 *
 * Each export writes a `platform.exportAudit` row BEFORE the first row is
 * read, as the web routes did: an export that fails halfway still put rows
 * in front of somebody. The row names the officer's platform account, found
 * through the GitHub login `gh` is signed in as (the identity they linked on
 * the platform), so an export nobody can attribute is refused rather than
 * recorded as nobody's. The row count is filled in when the file is done.
 *
 * ## Formats
 *
 * Attendance can be written as the platform CSV, a Bevy attendee import, an
 * Involvement Network email list, or several at once from one read (see
 * `formats.ts`); `--format`, else asked at a terminal, else the platform CSV.
 * Each file gets its own audit row, its format in the filters.
 *
 * ## The files
 *
 * At a terminal, each file's destination is asked for, with path completion
 * (`production/save-path.ts`), suggesting `<kind>[-<meeting>][-<from>][-<to>]
 * [-<format>].<ext>`. Without one, that name in the working directory.
 * `--out` names the file, or a folder for them all; `--out -` streams one
 * export to stdout without the byte-order mark, for a pipe. Files are created
 * readable by their owner only (they are member PII), never over an existing
 * file unless `--yes` or the prompt's own question says so. A failure partway
 * removes every partial file.
 *
 * `--from`/`--to` take Eastern days, `--to` inclusive (see `production/time.ts`).
 */
import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { open, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { multiselect, text as askText } from "@clack/prompts";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { isDryRun } from "@devdogsuga/cli-core/dry-run";
import { errorMessage, unwrap, UsageError } from "@devdogsuga/cli-core/ui";
import {
  connect,
  dbError,
  ProductionError,
  requireProductionKey,
  type Sql,
} from "../production/access.js";
import {
  canPrompt,
  expandHome,
  plural,
  reportFailure,
  say,
} from "../production/cli.js";
import {
  describeMeeting,
  findMeetingsWith,
  pickMeeting,
  type FindMeetings,
} from "../production/meetings.js";
import { askSavePath } from "../production/save-path.js";
import { parseBound } from "../production/time.js";
import {
  auditFilters,
  BOM,
  bevyFormat,
  bevyRequiredColumns,
  bevySurvey,
  EXPORT_KINDS,
  EXPORTS,
  exportParams,
  formatFor,
  FORMATS_BY_KIND,
  parseFormats,
  type ExportFilters,
  type ExportKind,
  type Format,
  type FormatName,
  type Row,
} from "@devdogsuga/events/exports";

/** Production, as an export uses it. One connection for the whole run. */
export interface ExportSource {
  /** Platform accounts that linked this GitHub login. */
  officersFor: (login: string) => Promise<string[]>;
  findMeetings: FindMeetings;
  /** Writes the audit row; returns its id. */
  audit: (
    userId: string,
    kind: ExportKind,
    filters: Record<string, string>,
  ) => Promise<string>;
  /** The export's rows, a page at a time, as column-name records. */
  rows: (
    kind: ExportKind,
    filters: ExportFilters,
  ) => AsyncIterable<Record<string, unknown>[]>;
  finish: (auditId: string, rowCount: number) => Promise<void>;
  close: () => Promise<void>;
}

/** Where the CSV goes. */
export interface Sink {
  write: (text: string) => Promise<void>;
  close: () => Promise<void>;
  /** Removes a partial file after a failure; a no-op for stdout. */
  discard: () => Promise<void>;
}

export interface ExportDeps {
  ghLogin?: () => Promise<string>;
  source?: () => Promise<ExportSource>;
  sink?: (path: string, overwrite: boolean, bom: boolean) => Promise<Sink>;
  /** Whether to ask for formats, a meeting and destinations. */
  interactive?: boolean;
  pickFormats?: (kind: ExportKind) => Promise<FormatName[]>;
  askMeeting?: () => Promise<string>;
  /** A destination, already confirmed if it replaces a file. */
  askPath?: (message: string, suggested: string) => Promise<string>;
}

interface Values {
  from?: string;
  to?: string;
  meeting?: string;
  format?: string[];
  out?: string;
  yes?: boolean;
  "dry-run"?: boolean;
}

/** One file this run writes. */
interface Planned {
  format: Format;
  path: string;
  overwrite: boolean;
}

function parse(argv: readonly string[]): { kind: ExportKind; values: Values } {
  const [kind, ...rest] = argv;
  if (!kind || !(EXPORT_KINDS as readonly string[]).includes(kind)) {
    throw new UsageError(
      kind
        ? `Unknown export "${kind}". Try ${EXPORT_KINDS.join(", ")}.`
        : `Name the export: ${EXPORT_KINDS.join(", ")}.`,
    );
  }
  try {
    const { values } = parseArgs({
      args: rest,
      options: {
        from: { type: "string" },
        to: { type: "string" },
        meeting: { type: "string" },
        format: { type: "string", multiple: true },
        out: { type: "string" },
        yes: { type: "boolean" },
        "dry-run": { type: "boolean" },
      },
      allowPositionals: false,
      strict: true,
    });
    if (values.meeting && kind !== "attendance" && kind !== "responses") {
      throw new UsageError(
        "--meeting only applies to the attendance and responses exports.",
      );
    }
    return { kind: kind as ExportKind, values };
  } catch (err) {
    if (err instanceof UsageError) throw err;
    throw new UsageError(errorMessage(err));
  }
}

const run = promisify(execFile);

/** The GitHub login `gh` is signed in as. */
export async function ghLogin(): Promise<string> {
  try {
    const { stdout } = await run("gh", ["api", "user", "--jq", ".login"]);
    const login = stdout.trim();
    if (login) return login;
  } catch {
    // Worded below.
  }
  throw new ProductionError(
    "Exports are audited under your GitHub login, and `gh` could not say " +
      "who you are. Install it from https://cli.github.com and run `gh auth login`.",
  );
}

export const OFFICER_QUERY = `
select distinct i."user_id"::text as "userId"
from "auth"."identities" i
where i."provider" = 'github'
  and lower(i."identity_data" ->> 'user_name') = lower($1)
`;

export function sourceWith(sql: Sql): ExportSource {
  return {
    officersFor: async (login) =>
      (await sql.unsafe(OFFICER_QUERY, [login])).map((r) => String(r.userId)),
    findMeetings: findMeetingsWith(sql),
    audit: async (userId, kind, filters) => {
      const [row] = await sql.unsafe(
        `insert into "platform"."exportAudit" ("userId", "kind", "filters")
         values ($1, $2, $3::text::jsonb) returning "id"::text as "id"`,
        [userId, kind, JSON.stringify(filters)],
      );
      return String(row!.id);
    },
    rows: async function* (kind, filters) {
      const { sql: query, transform } = EXPORTS[kind];
      for await (const page of sql
        .unsafe(query, exportParams(filters))
        .cursor(500)) {
        yield transform ? page.map(transform) : page;
      }
    },
    finish: async (auditId, rowCount) => {
      await sql.unsafe(
        `update "platform"."exportAudit" set "rowCount" = $1 where "id" = $2::uuid`,
        [rowCount, auditId],
      );
    },
    close: () => sql.end({ timeout: 5 }),
  };
}

async function productionSource(): Promise<ExportSource> {
  return sourceWith(connect(await requireProductionKey("DB_URL")));
}

async function fileSink(
  path: string,
  overwrite: boolean,
  bom: boolean,
): Promise<Sink> {
  if (path === "-") {
    return {
      write: (text) =>
        new Promise((resolve, reject) =>
          process.stdout.write(text, (err) => (err ? reject(err) : resolve())),
        ),
      close: () => Promise.resolve(),
      discard: () => Promise.resolve(),
    };
  }
  let handle;
  try {
    handle = await open(path, overwrite ? "w" : "wx", 0o600);
  } catch (err) {
    if ((err as { code?: string }).code === "EEXIST") {
      throw new UsageError(`${path} already exists. Pass --yes to replace it.`);
    }
    throw new UsageError(`Could not write ${path}.`);
  }
  if (bom) await handle.write(BOM);
  return {
    write: async (text) => {
      await handle.write(text);
    },
    close: () => handle.close(),
    discard: async () => {
      await handle.close().catch(() => undefined);
      await rm(path, { force: true });
    },
  };
}

function defaultName(
  kind: ExportKind,
  values: Values,
  format: Format,
  meetingSlug?: string,
): string {
  const parts: string[] = [kind];
  if (meetingSlug) parts.push(meetingSlug);
  if (values.from) parts.push(values.from.slice(0, 10));
  if (values.to) parts.push(values.to.slice(0, 10));
  if (format.suffix) parts.push(format.suffix);
  return `${parts.join("-")}.${format.extension}`;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

async function pickFormats(kind: ExportKind): Promise<FormatName[]> {
  return unwrap(
    await multiselect<FormatName>({
      message: "Which formats? (space to choose, enter to export)",
      options: FORMATS_BY_KIND[kind].map((name) => {
        const format = formatFor(name, []);
        return { value: name, label: format.label, hint: format.hint };
      }),
      initialValues: ["platform"],
      required: true,
    }),
  );
}

async function askMeeting(): Promise<string> {
  return unwrap(
    await askText({
      message: "Which meeting? Its day, slug or id.",
      placeholder: "2026-09-09",
      validate: (v) => (v?.trim() ? undefined : "A meeting, please."),
    }),
  ).trim();
}

async function askPath(message: string, suggested: string): Promise<string> {
  return askSavePath({ message, suggested });
}

/**
 * Where each file goes: `--out` (a file, `-`, or a folder for them all), else
 * asked at a terminal, else its default name here.
 */
async function planFiles(
  formats: readonly Format[],
  name: (format: Format) => string,
  values: Values,
  interactive: boolean,
  ask: (message: string, suggested: string) => Promise<string>,
): Promise<Planned[]> {
  const overwrite = values.yes === true;
  const out = values.out === undefined ? undefined : expandHome(values.out);
  if (out !== undefined && !isDirectory(out)) {
    if (formats.length > 1) {
      throw new UsageError(
        out === "-"
          ? "--out - streams one export; choose one --format."
          : "--out names one file; for several formats, give it a folder.",
      );
    }
    return [{ format: formats[0]!, path: out, overwrite }];
  }
  const planned: Planned[] = [];
  for (const format of formats) {
    if (out !== undefined) {
      planned.push({ format, path: join(out, name(format)), overwrite });
    } else if (interactive) {
      const path = await ask(`Save the ${format.label} to`, name(format));
      // The prompt asked before choosing a file that exists.
      planned.push({ format, path, overwrite: true });
    } else {
      planned.push({ format, path: name(format), overwrite });
    }
  }
  return planned;
}

const shown = (path: string) => (path === "-" ? "stdout" : path);

/** " as Bevy attendee import"; nothing for the platform CSV, the default. */
const as = (format: Format) =>
  format.name === "platform" ? "" : ` as ${format.label}`;

export async function runExport(
  argv: readonly string[],
  deps: ExportDeps = {},
): Promise<void> {
  let source: ExportSource | undefined;
  const sinks: Sink[] = [];
  let done = false;
  try {
    const { kind, values } = parse(argv);
    const filters: ExportFilters = {
      from: parseBound("--from", values.from),
      to: parseBound("--to", values.to),
    };
    if (filters.from && filters.to && filters.from >= filters.to) {
      throw new UsageError("--from must come before --to.");
    }
    const interactive = deps.interactive ?? canPrompt();

    let names: FormatName[];
    try {
      names = values.format ? parseFormats(values.format, kind) : [];
    } catch (err) {
      throw new UsageError(errorMessage(err));
    }
    if (names.length === 0) {
      names =
        FORMATS_BY_KIND[kind].length > 1 && interactive
          ? await (deps.pickFormats ?? pickFormats)(kind)
          : ["platform"];
    }
    const { columns } = EXPORTS[kind];
    let formats = names.map((n) => formatFor(n, columns));

    const perEvent = formats.filter((f) => f.perEvent);
    if (perEvent.length > 0 && !values.meeting) {
      if (!interactive) {
        throw new UsageError(
          `The ${perEvent.map((f) => f.label).join(" and ")} ` +
            `${perEvent.length === 1 ? "file is" : "files are"} for one ` +
            "meeting; name it with --meeting.",
        );
      }
      values.meeting = await (deps.askMeeting ?? askMeeting)();
    }

    const login = await (deps.ghLogin ?? ghLogin)();
    source = await (deps.source ?? productionSource)();
    const officers = await source.officersFor(login);
    if (officers.length !== 1) {
      throw new ProductionError(
        officers.length === 0
          ? `No platform account has linked the GitHub login ${login}. ` +
              "Link GitHub on your platform profile, then export again."
          : `${plural(officers.length, "platform account")} linked the GitHub login ${login}; ` +
              "an export must be attributable to one.",
      );
    }

    let slug: string | undefined;
    if (values.meeting) {
      const meeting = pickMeeting(
        values.meeting,
        await source.findMeetings(values.meeting),
      );
      filters.meetingId = meeting.id;
      slug = meeting.slug;
      say(`Meeting: ${describeMeeting(meeting)}.`);
    }

    // The Bevy file carries the meeting's survey answers in its `survey:`
    // columns, read the way `export responses --meeting` reads them.
    if (names.includes("bevy") && filters.meetingId) {
      const answers: Row[] = [];
      for await (const page of source.rows("responses", {
        meetingId: filters.meetingId,
      })) {
        answers.push(...page);
      }
      const survey = bevySurvey(answers, bevyRequiredColumns());
      formats = formats.map((f) =>
        f.name === "bevy" ? bevyFormat(survey) : f,
      );
    }

    const files = await planFiles(
      formats,
      (format) => defaultName(kind, values, format, slug),
      values,
      interactive,
      deps.askPath ?? askPath,
    );
    if (values["dry-run"] === true || isDryRun()) {
      for (const file of files) {
        say(
          `Would export ${kind}${as(file.format)} to ${shown(file.path)}, audited as ${login}.`,
        );
      }
      return;
    }

    const open = deps.sink ?? fileSink;
    const writing = [];
    for (const file of files) {
      const sink = await open(
        file.path,
        file.overwrite,
        file.format.bom && file.path !== "-",
      );
      sinks.push(sink);
      const recorded = auditFilters(filters);
      if (file.format.name !== "platform") {
        recorded.format = file.format.name;
      }
      writing.push({
        file,
        sink,
        writer: file.format.writer(),
        auditId: await source.audit(officers[0]!, kind, recorded),
        count: 0,
      });
    }

    for (const w of writing) {
      if (w.file.format.head) await w.sink.write(w.file.format.head);
    }
    for await (const page of source.rows(kind, filters)) {
      for (const w of writing) {
        const { text, count } = w.writer.page(page);
        if (text) await w.sink.write(text);
        w.count += count;
      }
    }
    for (const w of writing) {
      const last = w.writer.end?.();
      if (last?.text) await w.sink.write(last.text);
      w.count += last?.count ?? 0;
      await w.sink.close();
    }
    done = true;

    for (const w of writing) {
      await source.finish(w.auditId, w.count);
      const [one, many] = w.file.format.unit;
      say(
        `Wrote ${plural(w.count, one, many)}${as(w.file.format)} to ${shown(w.file.path)}.`,
        "success",
      );
      const skipped = w.writer.skipped();
      if (skipped > 0) {
        say(
          `${plural(skipped, "attendee")} without ${w.file.format.needs} on file ` +
            `${skipped === 1 ? "is" : "are"} not in ${shown(w.file.path)}.`,
          "warn",
        );
      }
    }
  } catch (err) {
    if (!done) {
      await Promise.all(sinks.map((s) => s.discard().catch(() => undefined)));
    }
    const worded =
      err instanceof UsageError || err instanceof ProductionError
        ? err
        : (err as { code?: string }).code
          ? dbError("The export failed", err)
          : err;
    reportFailure("export", worded);
  } finally {
    await source?.close().catch(() => undefined);
  }
}

export const handleExport: CommandHandler = async (rest) => {
  await runExport(rest);
  return process.exitCode ? null : DONE;
};
