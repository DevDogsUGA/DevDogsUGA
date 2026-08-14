/**
 * An editable `.env` that survives being edited.
 *
 * The root `.env` is not a data file — it is 150 lines of hard-won commentary
 * about which value breaks the Supabase CLI when empty, which one must stay
 * commented out, and why. A writer that parses to a Map and serializes back
 * destroys all of it on the first save, and nobody notices until they need the
 * note that is gone.
 *
 * So this keeps the file as **lines** and edits in place. An untouched line is
 * returned byte-for-byte, including its spacing, its quoting style and its
 * trailing comment. Only the lines actually being changed are rewritten.
 *
 * The other half of the contract is that **nothing is ever deleted**. Removing
 * a key comments it out, which keeps the value recoverable from the file itself
 * rather than from somebody's memory of what it used to be — and re-adding it
 * later uncomments the line rather than appending a duplicate.
 */

/**
 * `KEY=value`, active. Groups: indent, `export ` prefix, key, value.
 *
 * The prefix is CAPTURED rather than skipped so an update can put it back.
 * Dropping it turns `export FOO=` into `FOO=`, which still parses here and
 * stops being exported to child processes — a difference that shows up as a
 * missing variable three tools downstream.
 */
const ACTIVE = /^(\s*)((?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
/** `# KEY=value`, the commented form this tool writes and reads back. */
const COMMENTED = /^(\s*)#\s?((?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

export interface EnvLine {
  raw: string;
  key?: string;
  /** Parsed value, when this line is an assignment. */
  value?: string;
  commented?: boolean;
}

/**
 * Reads the value half of an assignment.
 *
 * Deliberately NOT a general dotenv parser: it does not expand `$VAR`, because
 * a stored value that means one thing in the file and another in the process
 * cannot be rotated with confidence.
 */
export function parseValue(rest: string): string {
  const text = rest.trim();

  if (text.startsWith('"')) {
    const end = findClosing(text, '"');
    if (end === -1) return unescape(text.slice(1));
    return unescape(text.slice(1, end));
  }
  if (text.startsWith("'")) {
    const end = findClosing(text, "'");
    if (end === -1) return text.slice(1);
    // Single quotes are literal — the only way to store a backslash sequence
    // verbatim.
    return text.slice(1, end);
  }

  // Unquoted. A `#` only starts a comment when whitespace precedes it: `#` is
  // an ordinary character in a generated password, and stripping from the first
  // one truncates the credential into something that still looks like one.
  const hash = text.search(/\s#/);
  return (hash === -1 ? text : text.slice(0, hash)).trim();
}

function findClosing(text: string, quote: string): number {
  for (let i = 1; i < text.length; i += 1) {
    if (text[i] === "\\") {
      i += 1;
      continue;
    }
    if (text[i] === quote) return i;
  }
  return -1;
}

function unescape(text: string): string {
  return text.replace(/\\([nrt\\"'])/g, (_, c: string) =>
    c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c,
  );
}

/** Always double-quoted, so a multi-line value round-trips through one line. */
export function quote(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}"`;
}

export class EnvDocument {
  /** Whether this session has already appended, so it separates only once. */
  private appended = false;

  private constructor(private lines: EnvLine[]) {}

  static parse(text: string): EnvDocument {
    const lines: EnvLine[] = text.split("\n").map((raw) => {
      const active = ACTIVE.exec(raw);
      if (active) {
        return { raw, key: active[3], value: parseValue(active[4]!) };
      }
      const commented = COMMENTED.exec(raw);
      if (commented) {
        return {
          raw,
          key: commented[3],
          value: parseValue(commented[4]!),
          commented: true,
        };
      }
      return { raw };
    });
    return new EnvDocument(lines);
  }

  static empty(): EnvDocument {
    return new EnvDocument([]);
  }

  private find(key: string, commented: boolean): number {
    return this.lines.findIndex(
      (l) => l.key === key && Boolean(l.commented) === commented,
    );
  }

  /** The active value, or undefined when absent or commented out. */
  get(key: string): string | undefined {
    const i = this.find(key, false);
    return i === -1 ? undefined : this.lines[i]!.value;
  }

  /** Present and active. */
  has(key: string): boolean {
    return this.find(key, false) !== -1;
  }

  /** Present, but commented out. */
  isCommented(key: string): boolean {
    return this.find(key, false) === -1 && this.find(key, true) !== -1;
  }

  /** Every active assignment, in file order. */
  entries(): [string, string][] {
    return this.lines
      .filter((l) => l.key !== undefined && !l.commented)
      .map((l) => [l.key!, l.value!]);
  }

  keys(): string[] {
    return this.entries().map(([k]) => k);
  }

  /**
   * Sets a value, preferring to revive a commented line over appending.
   *
   * Appending when a commented form already exists is how a file ends up with
   * the same key twice — one of them stale, both of them plausible, and the
   * loser silently winning depending on which the reader scrolled to.
   */
  set(key: string, value: string): void {
    const active = this.find(key, false);
    if (active !== -1) {
      const line = this.lines[active]!;
      line.raw = line.raw.replace(
        ACTIVE,
        (_m, indent: string, exported: string, k: string) =>
          `${indent}${exported}${k}=${quote(value)}`,
      );
      line.value = value;
      return;
    }

    const commented = this.find(key, true);
    if (commented !== -1) {
      const line = this.lines[commented]!;
      line.raw = `${key}=${quote(value)}`;
      line.value = value;
      line.commented = false;
      return;
    }

    // One blank line between the file's own contents and anything appended,
    // and only one: a separator per appended key would grow a gap every time a
    // sync adds a batch.
    if (
      !this.appended &&
      this.lines.length > 0 &&
      this.lines.at(-1)!.raw !== ""
    ) {
      this.lines.push({ raw: "" });
    }
    this.appended = true;
    this.lines.push({ raw: `${key}=${quote(value)}`, key, value });
  }

  /**
   * Comments a key out rather than deleting it.
   *
   * A no-op when it is already commented or absent, so running a sync twice
   * cannot produce `## KEY=`.
   */
  comment(key: string): boolean {
    const i = this.find(key, false);
    if (i === -1) return false;
    const line = this.lines[i]!;
    line.raw = `# ${line.raw.trimStart()}`;
    line.commented = true;
    return true;
  }

  /** Restores a commented assignment. Returns its value, or undefined. */
  uncomment(key: string): string | undefined {
    const i = this.find(key, true);
    if (i === -1) return undefined;
    const line = this.lines[i]!;
    line.raw = line.raw.replace(/^(\s*)#\s?/, "$1");
    line.commented = false;
    return line.value;
  }

  toString(): string {
    return this.lines.map((l) => l.raw).join("\n");
  }
}
