/**
 * `.env` parsing and serialization, and the diff between a file and a project.
 *
 * Pure, and separate from everything that touches the network, because this is
 * the half that can be wrong quietly. A parser that drops the last line, or
 * unquotes one escape wrongly, produces a file that looks right and a
 * credential that is not — and the way you find out is a deploy failing to
 * authenticate against something.
 *
 * Deliberately not dotenv-the-package: `with-env` loads the real files through
 * dotenvx, and this module has a different job. It has to round-trip a value
 * byte-for-byte through BWS, including the newlines in a PEM key and the `#`
 * in a generated password, neither of which a loader-shaped parser needs to
 * preserve.
 */

export type EnvMap = Map<string, string>;

/**
 * Parses the subset of `.env` syntax that a secret store can round-trip.
 *
 * Supported: `KEY=value`, `KEY="value"`, `KEY='value'`, `export KEY=value`,
 * blank lines, and `#` comments on their own line. Double-quoted values honour
 * `\n`, `\r`, `\t`, `\\` and `\"`; single-quoted values are literal, which is
 * the only way to store a value that itself contains a backslash.
 *
 * NOT supported, on purpose: `$VAR` interpolation. dotenvx expands it at load
 * time, so a stored `$HOME` would mean one thing in the file and another in the
 * process — and a secret that changes meaning depending on who reads it is not
 * a secret you can rotate with confidence.
 */
export function parseEnv(source: string): EnvMap {
  const out: EnvMap = new Map();

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ")
      ? line.slice("export ".length).trimStart()
      : line;

    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    out.set(key, parseValue(withoutExport.slice(eq + 1).trim()));
  }

  return out;
}

function parseValue(raw: string): string {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1);
  }
  // Unquoted: strip a trailing same-line comment. Only when whitespace
  // precedes the `#`, because `#` is a perfectly ordinary character inside a
  // generated password and stripping from the first one would silently
  // truncate it.
  return raw.replace(/\s+#.*$/, "").trim();
}

/**
 * Renders a map back to `.env`, always double-quoted.
 *
 * Quoting unconditionally rather than only when needed: the rule for "needs
 * quotes" is subtle (leading spaces, `#`, `=`, newlines), and a file where
 * every value looks the same is one where a reviewer notices the odd one out.
 * Keys are sorted so a re-pull produces no diff when nothing changed.
 */
export function serializeEnv(values: EnvMap, header?: string): string {
  const lines: string[] = [];
  if (header) {
    for (const line of header.split("\n")) lines.push(`# ${line}`.trimEnd());
    lines.push("");
  }

  for (const key of [...values.keys()].sort()) {
    lines.push(`${key}="${escapeValue(values.get(key) ?? "")}"`);
  }

  return lines.join("\n") + "\n";
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

// ── Diffing ──────────────────────────────────────────────────────────────────

export interface EnvDiff {
  /** In the file, not in the project. */
  added: string[];
  /** In both, different value. */
  changed: string[];
  /** In both, same value. */
  unchanged: string[];
  /** In the project, not in the file. Never removed without `--prune`. */
  orphaned: string[];
}

export function diffEnv(local: EnvMap, remote: EnvMap): EnvDiff {
  const added: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];

  for (const [key, value] of local) {
    if (!remote.has(key)) added.push(key);
    else if (remote.get(key) === value) unchanged.push(key);
    else changed.push(key);
  }

  const orphaned = [...remote.keys()].filter((key) => !local.has(key));

  return {
    added: added.sort(),
    changed: changed.sort(),
    unchanged: unchanged.sort(),
    orphaned: orphaned.sort(),
  };
}

export function diffIsEmpty(diff: EnvDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.changed.length === 0 &&
    diff.orphaned.length === 0
  );
}

/**
 * A fingerprint, for showing that a value changed without showing the value.
 *
 * Length plus first and last character. Enough to tell "I pasted the wrong
 * token" from "the token rotated", and not enough to reconstruct anything. The
 * whole point of these commands is to move secrets without printing them, and a
 * diff that renders values would undo that in the one place people paste output
 * into a chat window.
 */
export function fingerprint(value: string): string {
  if (value === "") return "empty";
  if (value.length <= 4) return `${value.length} chars`;
  return `${value.length} chars, ${value[0]}…${value[value.length - 1]}`;
}
