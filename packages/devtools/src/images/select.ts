import { FORMATS, type Format } from "@devdogsuga/og";
import type { Graphic } from "./graphics.js";

/**
 * Turning what somebody typed into a list of (graphic, format) pairs.
 *
 * Kept apart from `commands.ts` because all of it is pure: given a registry and
 * some patterns, these answer the same way every time and can be tested
 * without a terminal, a database or a renderer.
 */

/** One image to render: a subject, and the size to draw it at. */
export interface Selection {
  graphic: Graphic;
  format: Format;
}

export interface GraphicMatch {
  matched: Graphic[];
  /** Patterns that named nothing, so the caller can say which. */
  unmatched: string[];
}

/**
 * Resolves graphic patterns.
 *
 * Every graphic is `group/name`, and three shapes of pattern read against
 * that: a lone star (or a star over a star) is everything, `group/` plus a star
 * is a whole group, and anything else is an exact name. Deliberately not a
 * general glob — `event/2026-` plus a star looks like it should work and would
 * be one more thing to specify, and the picker covers the case where somebody
 * does not know the exact name.
 *
 * A bare group is accepted as shorthand for `group/*`, because `images icons`
 * is what people type and refusing it teaches nothing.
 */
export function matchGraphics(
  patterns: readonly string[],
  graphics: readonly Graphic[],
): GraphicMatch {
  const matched = new Map<string, Graphic>();
  const unmatched: string[] = [];
  const groups = new Set(graphics.map((graphic) => graphic.group));

  for (const pattern of patterns) {
    const hits = graphics.filter((graphic) => {
      if (pattern === "*" || pattern === "*/*") return true;
      if (pattern.endsWith("/*")) return graphic.group === pattern.slice(0, -2);
      if (groups.has(pattern)) return graphic.group === pattern;

      return graphic.name === pattern;
    });

    if (hits.length === 0) {
      unmatched.push(pattern);
      continue;
    }
    for (const hit of hits) matched.set(hit.name, hit);
  }

  return { matched: [...matched.values()], unmatched };
}

/**
 * Pairs each graphic with each requested format it actually supports.
 *
 * The matrix is sparse, and silently dropping a pair is the wrong answer in one
 * direction only: asking for `*` at every format should quietly skip the
 * combinations that do not exist, while asking for one graphic at one format it
 * cannot do should say so. The caller decides which case it is; this reports
 * both halves.
 */
export function pair(
  graphics: readonly Graphic[],
  formats: readonly string[],
): {
  selections: Selection[];
  unsupported: { graphic: string; format: string }[];
} {
  const selections: Selection[] = [];
  const unsupported: { graphic: string; format: string }[] = [];

  for (const graphic of graphics) {
    for (const name of formats) {
      const format = FORMATS[name];
      if (!format) continue;

      if (graphic.formats.includes(name)) {
        selections.push({ graphic, format });
      } else {
        unsupported.push({ graphic: graphic.name, format: name });
      }
    }
  }

  return { selections, unsupported };
}

/** Every format any of these graphics can be drawn at, in registry order. */
export function formatsFor(graphics: readonly Graphic[]): Format[] {
  const names = new Set(graphics.flatMap((graphic) => graphic.formats));

  return Object.values(FORMATS).filter((format) => names.has(format.name));
}

/**
 * Splits `--flag=value` into two tokens.
 *
 * The rest of this CLI reads flags as `--flag value`, and `positionals()`
 * depends on that to tell a flag's value from a subcommand. `--format=a,b`
 * arrives as one token, so it would be read as a positional — that is, as a
 * graphic name — and `images --format=og` would try to render a graphic called
 * `--format=og` and report nothing matched. Normalising here lets both spellings
 * work without teaching the shared parser about either.
 */
export function normalizeArgv(argv: readonly string[]): string[] {
  return argv.flatMap((token) => {
    if (!token.startsWith("--")) return [token];
    const eq = token.indexOf("=");

    return eq === -1 ? [token] : [token.slice(0, eq), token.slice(eq + 1)];
  });
}

/** A comma-separated flag value, trimmed and emptied of blanks. */
export function commaList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
