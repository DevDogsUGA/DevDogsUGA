/**
 * The Dart pass, on the Node side.
 *
 * There is no way to analyze Dart from Node, so the analysis happens in
 * `apps/study-group-finder/tool/docs_extract.dart` under the Flutter SDK's own
 * analyzer and arrives here as JSON. Everything in this file is the translation
 * of that JSON into the same `DocGroup`/`DocSymbol` shapes the TypeScript pass
 * produces, so both render through the one emitter: a widget's constructor
 * parameters are a props table by another name.
 *
 * Nothing here throws. Most contributors to this monorepo will never install
 * Flutter, and a web-only clone still has to build its docs, so a missing SDK,
 * a script that will not run and JSON that will not parse all end the same way:
 * an empty result and one warning saying the pass was skipped.
 */
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import { emptyResult } from "./model.js";
import { repoRelative } from "./program.js";
import type {
  CoverageRow,
  DocGroup,
  DocSymbol,
  ExtractResult,
  ParamDoc,
  SymbolKind,
} from "./model.js";

/** Relative to the app directory, which is where the script is run from. */
const SCRIPT = "tool/docs_extract.dart";

/**
 * Must match `schemaVersion` in the script. The two halves are one contract;
 * refusing a version this reader does not know is how a field that changed
 * meaning surfaces as a skipped pass instead of a silently wrong page.
 */
const SCHEMA_VERSION = 1;

/**
 * `dart run` resolves dependencies before it runs anything, and on a cold
 * checkout that reaches the network. A build must not hang there.
 */
const RUN_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 20_000;

/** Room for a much larger app than this one; `spawnSync` defaults to 1 MB. */
const OUTPUT_LIMIT = 64 * 1024 * 1024;

/** How many of the script's own stderr lines are worth repeating. */
const DIAGNOSTIC_LIMIT = 10;

/** The kinds the script emits, every one of them a `SymbolKind`. */
const DART_KINDS = new Set<SymbolKind>([
  "widget",
  "class",
  "enum",
  "extension",
  "function",
  "constant",
]);

/** One entry of the script's `declarations` array, after validation. */
interface DartDeclaration {
  name: string;
  kind: SymbolKind;
  /** Relative to the app directory: `lib/groups/group_card.dart`. */
  library: string;
  line: number;
  doc: string | null;
  signature: string | null;
  params: ParamDoc[];
}

/**
 * Reference pages for the Flutter app. `appDir` is `apps/study-group-finder`,
 * repo-relative or absolute. Every path this builds is repo-relative, because
 * that is what the emitter's source links resolve against, so the one it is
 * handed is reduced to that first.
 */
export function extractDart(repoRoot: string, appDir: string): ExtractResult {
  const root = trimTrailingSlash(toPosix(repoRoot));
  const dir = trimTrailingSlash(repoRelative(root, toPosix(appDir)));
  const absDir = `${root}/${dir}`;

  if (!isFile(`${absDir}/${SCRIPT}`)) {
    return skipped(`${dir}/${SCRIPT} does not exist`);
  }
  if (!dartAvailable()) {
    return skipped(
      "`dart` is not on PATH — install the Flutter SDK to include it",
    );
  }

  // No `--out`: the script writes JSON to stdout when it is left off, and a
  // temporary file would only be one more thing to clean up.
  const run = spawnSync("dart", ["run", SCRIPT], {
    cwd: absDir,
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
    maxBuffer: OUTPUT_LIMIT,
  });

  if (run.error !== undefined) {
    return skipped(`\`dart run ${SCRIPT}\` failed: ${run.error.message}`);
  }
  if (run.status !== 0) {
    const how =
      run.status === null
        ? `killed by ${run.signal ?? "a signal"}`
        : `exited ${run.status}`;
    return skipped(`\`dart run ${SCRIPT}\` ${how}: ${firstLine(run.stderr)}`);
  }

  const document = asRecord(parseJson(run.stdout));
  if (document === null) {
    return skipped(`${SCRIPT} printed something other than a JSON object`);
  }

  const version = document["version"];
  if (version !== SCHEMA_VERSION) {
    return skipped(
      `${SCRIPT} reports schema version ${String(version)}, and this reader ` +
        `understands ${SCHEMA_VERSION}`,
    );
  }

  const declarations = document["declarations"];
  if (!Array.isArray(declarations)) {
    return skipped(`${SCRIPT} printed no \`declarations\` array`);
  }

  return build(dir, dartPackageName(absDir, dir), declarations, run.stderr);
}

/**
 * The empty result plus the single line that explains it. Every caller of this
 * is a case where the docs still build and the Flutter app is simply absent
 * from them, which is the intended outcome on a machine without the SDK.
 */
function skipped(reason: string): ExtractResult {
  return {
    ...emptyResult(),
    warnings: [`Dart reference skipped: ${reason}.`],
  };
}

/**
 * The cheap probe that decides the whole pass. Asking the SDK for its version
 * costs a process and separates "no Flutter here" from "the extractor is
 * broken", which are different warnings to a reader.
 */
function dartAvailable(): boolean {
  const probe = spawnSync("dart", ["--version"], {
    stdio: "ignore",
    timeout: PROBE_TIMEOUT_MS,
  });
  return probe.error === undefined && probe.status === 0;
}

/* JSON to IR ------------------------------------------------------------- */

function build(
  appDir: string,
  packageName: string,
  declarations: unknown[],
  stderr: string,
): ExtractResult {
  // Keyed by directory relative to `lib`, `""` for the files directly in it.
  const byDirectory = new Map<string, DocSymbol[]>();
  const warnings = diagnostics(stderr);
  let dropped = 0;

  for (const entry of declarations) {
    const declaration = asDeclaration(entry);
    if (declaration === null) {
      dropped += 1;
      continue;
    }

    const key = directoryOf(underLib(declaration.library));
    const symbols = byDirectory.get(key);
    const symbol = toSymbol(declaration, appDir, packageName);
    if (symbols === undefined) byDirectory.set(key, [symbol]);
    else symbols.push(symbol);
  }

  if (dropped > 0) {
    warnings.push(
      `Dropped ${dropped} Dart ${dropped === 1 ? "declaration" : "declarations"} ` +
        `the JSON did not describe in a shape this reader recognises.`,
    );
  }

  const project = basename(appDir);
  const groups: DocGroup[] = [];
  const coverage: CoverageRow[] = [];

  // Sorted, and ordered by that sort, so two runs over the same tree emit the
  // same pages in the same order.
  for (const key of [...byDirectory.keys()].sort(compareStrings)) {
    const symbols = byDirectory.get(key) ?? [];
    // `lib` is the title for the files directly under it, which is what the
    // reader sees in the tree and in the import path.
    const title = key === "" ? "lib" : `lib/${key}`;
    const group: DocGroup = {
      path: `${project}/reference/${key === "" ? "lib" : key}`,
      title,
      description: `Dart declarations in \`${appDir}/${title}\`.`,
      order: groups.length + 1,
      symbols,
    };

    groups.push(group);
    coverage.push({
      area: group.path,
      symbols: symbols.length,
      documented: symbols.filter((symbol) => symbol.summary !== null).length,
    });
  }

  return { groups, routes: [], coverage, warnings };
}

/**
 * `superclass` is deliberately unread: the `extends` clause is already the tail
 * of `signature`, and printing it twice would say nothing the reader cannot see.
 */
function toSymbol(
  declaration: DartDeclaration,
  appDir: string,
  packageName: string,
): DocSymbol {
  const params = declaration.params;
  return {
    name: declaration.name,
    kind: declaration.kind,
    importPath: `package:${packageName}/${underLib(declaration.library)}`,
    importStyle: "named",
    summary: declaration.doc,
    signature: declaration.signature,
    params,
    // A widget's constructor parameters are the props a caller passes it, and
    // the column heading is the only thing on the page that says so.
    paramsLabel:
      params.length === 0
        ? null
        : declaration.kind === "widget"
          ? "Prop"
          : "Parameter",
    // A Dart return type is the head of the signature, never a separate line.
    // No TypeScript tag has a Dart meaning: not `client`, not `default export`,
    // not `public`. Both stay empty rather than being invented.
    returns: null,
    shape: null,
    tags: [],
    source: {
      file: `${appDir}/${declaration.library}`,
      line: declaration.line,
    },
    // Every declaration this file builds came out of the Dart analyzer, so the
    // emitter is told once, here. It picks the `dart` fence and the
    // `import 'package:…';` line. Without it the page would claim a widget is
    // TypeScript and print an import that compiles in neither language.
    language: "dart",
  };
}

/**
 * A declaration is dropped whole when any field the page is built from is
 * missing, rather than being rendered with a hole in it. `kind` has to be one
 * of the six the emitter has a section for; anything else is a schema the
 * script and this reader no longer agree on.
 */
function asDeclaration(value: unknown): DartDeclaration | null {
  const record = asRecord(value);
  if (record === null) return null;

  const name = asString(record["name"]);
  const kind = asKind(record["kind"]);
  const library = asString(record["library"]);
  const line = asLine(record["line"]);
  if (name === null || kind === null || library === null || line === null) {
    return null;
  }

  return {
    name,
    kind,
    library: trimTrailingSlash(toPosix(library)),
    line,
    doc: asString(record["doc"]),
    signature: asString(record["signature"]),
    params: asParams(record["params"]),
  };
}

function asParams(value: unknown): ParamDoc[] {
  if (!Array.isArray(value)) return [];

  const params: ParamDoc[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (record === null) continue;
    const name = asString(record["name"]);
    if (name === null) continue;

    params.push({
      name,
      // `dynamic` is what Dart itself calls a type it does not know, so it is
      // the one fallback here that is not a guess.
      type: asString(record["type"]) ?? "dynamic",
      required: record["required"] === true,
      default: asString(record["default"]),
      description: asString(record["doc"]),
    });
  }
  return params;
}

/**
 * The script names on stderr what it had to skip, a mixin or a mutable
 * top-level, because the schema has no kind for those. Repeating those lines
 * keeps a documented declaration from disappearing between the two halves. The
 * cap is so one pathological file cannot bury the rest of the run.
 */
function diagnostics(stderr: string): string[] {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const shown = lines.slice(0, DIAGNOSTIC_LIMIT);
  if (lines.length > shown.length) {
    shown.push(`…and ${lines.length - shown.length} more from ${SCRIPT}.`);
  }
  return shown;
}

/* Paths ------------------------------------------------------------------ */

/**
 * What a Dart reader types is the pubspec's name, not the directory's:
 * `study-group-finder` on disk is `study_group_finder` on an import line, and
 * only the pubspec says so.
 */
function dartPackageName(absDir: string, appDir: string): string {
  const pubspec = readFile(`${absDir}/pubspec.yaml`);
  const declared =
    pubspec === null
      ? null
      : /^name:[ \t]*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/m.exec(pubspec);

  const name = declared?.[1] ?? declared?.[2] ?? declared?.[3];
  return name ?? basename(appDir).replace(/-/g, "_");
}

/** `lib/groups/card.dart` → `groups/card.dart`, which is the import path. */
function underLib(library: string): string {
  return library.startsWith("lib/") ? library.slice("lib/".length) : library;
}

/** The directory part, `""` for a file with no directory above it. */
function directoryOf(path: string): string {
  const at = path.lastIndexOf("/");
  return at === -1 ? "" : path.slice(0, at);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, "");
}

/* Narrowing -------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Empty strings read as absent, which is what the emitter's `null` means. */
function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asKind(value: unknown): SymbolKind | null {
  return typeof value === "string" && DART_KINDS.has(value as SymbolKind)
    ? (value as SymbolKind)
    : null;
}

function asLine(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/* Misc ------------------------------------------------------------------- */

/** `Array.prototype.sort`'s default coerces; this states the comparison. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Enough of a failure to act on, without pasting a stack trace into a warning. */
function firstLine(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate !== "");
  return line === undefined ? "no output" : line.slice(0, 200);
}

function readFile(path: string): string | null {
  try {
    return fs.readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function isFile(path: string): boolean {
  return fs.statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}
