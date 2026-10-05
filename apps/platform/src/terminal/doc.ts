/**
 * The terminal's document model: styled spans on fixed-width lines, kept as
 * data until the very end so one tree serialises either as ANSI or as plain
 * text (`?format=txt`), and so every width calculation works on visible
 * characters rather than on strings with escape codes in them.
 *
 * Nothing here knows about pages or routes. `blocks.ts` builds lines out of
 * these, `layout.ts` frames them, and `serialize` is the only function that
 * ever writes an escape sequence.
 */

/** Every page is laid out to this many columns: the "80×24" the title bar claims. */
export const WIDTH = 80;

/** The left margin every body line carries. */
export const GUTTER = 2;

/** The width body content wraps to, between the gutters. */
export const MEASURE = WIDTH - GUTTER * 2;

export interface Style {
  /** `#rrggbb`. */
  fg?: string;
  /** `#rrggbb`. Used for chips only; the page itself never paints a ground. */
  bg?: string;
  bold?: boolean;
}

export interface Span extends Style {
  text: string;
}

export type Line = Span[];

/**
 * A span of `text` in `style`. Only the style properties are copied, so a
 * neighbouring span can be passed as the style ("a space in this word's
 * colour") without its text coming along.
 */
export function span(text: string, { fg, bg, bold }: Style = {}): Span {
  return { text, fg, bg, bold };
}

/**
 * Visible columns. Code points rather than UTF-16 units, and every code point
 * counted as one column: the kit only draws box-drawing, block and Latin
 * characters, and authored copy that strays outside them (an emoji in a
 * brief) costs at worst one column of overhang.
 */
export function textWidth(text: string): number {
  let width = 0;
  for (const _ of text) width++;
  return width;
}

export function lineWidth(line: Line): number {
  return line.reduce((sum, part) => sum + textWidth(part.text), 0);
}

/** Right-pads a line with unstyled spaces to `width` columns. */
export function padLine(line: Line, width: number): Line {
  const gap = width - lineWidth(line);
  return gap > 0 ? [...line, span(" ".repeat(gap))] : line;
}

/** Cuts a string to `width` columns, ending in an ellipsis when it had to. */
export function truncate(text: string, width: number): string {
  if (textWidth(text) <= width) return text;
  return [...text].slice(0, Math.max(0, width - 1)).join("") + "…";
}

interface Word {
  parts: Span[];
  width: number;
}

/** Splits styled spans into words, keeping each fragment's style. */
function words(spans: readonly Span[]): Word[] {
  const out: Word[] = [];
  let current: Word | null = null;
  for (const part of spans) {
    for (const piece of part.text.split(/(\s+)/)) {
      if (piece === "") continue;
      if (/^\s+$/.test(piece)) {
        current = null;
        continue;
      }
      const fragment = { ...part, text: piece };
      if (current) {
        current.parts.push(fragment);
        current.width += textWidth(piece);
      } else {
        current = { parts: [fragment], width: textWidth(piece) };
        out.push(current);
      }
    }
  }
  return out;
}

/**
 * Word-wraps styled spans to `width` columns. A single word longer than the
 * measure (a URL, usually) gets a line of its own and overhangs rather than
 * being broken, because a broken URL can't be copied out of a terminal.
 */
export function wrap(spans: readonly Span[], width: number): Line[] {
  const lines: Line[] = [];
  let line: Line = [];
  let used = 0;
  for (const word of words(spans)) {
    const needed = used === 0 ? word.width : used + 1 + word.width;
    if (used > 0 && needed > width) {
      lines.push(line);
      line = [];
      used = 0;
    }
    if (used > 0) {
      line.push(span(" ", word.parts[0]));
      used++;
    }
    line.push(...word.parts);
    used += word.width;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/** `wrap` for a single run of same-styled text. */
export function wrapText(
  text: string,
  width: number,
  style: Style = {},
): Line[] {
  return wrap([span(text, style)], width);
}

/** Prefixes every line, e.g. with a gutter or a box edge. */
export function indent(lines: readonly Line[], prefix: Line): Line[] {
  return lines.map((line) => [...prefix, ...line]);
}

function sgr(hex: string, ground: 38 | 48): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `\x1b[${ground};2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
}

/** Joins neighbouring spans that share a style, so a wrapped paragraph is one run. */
function merge(line: Line): Line {
  const out: Line = [];
  for (const part of line) {
    const last = out.at(-1);
    if (
      last &&
      last.fg === part.fg &&
      last.bg === part.bg &&
      Boolean(last.bold) === Boolean(part.bold)
    ) {
      out[out.length - 1] = { ...last, text: last.text + part.text };
    } else {
      out.push(part);
    }
  }
  return out;
}

/**
 * The only place an escape sequence is written. Truecolor SGR, reset after
 * every styled run so a line cut off by a narrow terminal never bleeds its
 * colour into the shell prompt that follows. Trailing spaces are trimmed:
 * padding exists for box edges, and a line ending in blanks is noise in a
 * copy-paste.
 */
export function serialize(lines: readonly Line[], color: boolean): string {
  return (
    lines
      .map((line) => {
        let out = "";
        for (const part of merge(line)) {
          const styled = color && (part.fg ?? part.bg ?? part.bold);
          if (!styled) {
            out += part.text;
            continue;
          }
          let open = "";
          if (part.bold) open += "\x1b[1m";
          if (part.fg) open += sgr(part.fg, 38);
          if (part.bg) open += sgr(part.bg, 48);
          out += `${open}${part.text}\x1b[0m`;
        }
        return out.replace(/ +$/, "");
      })
      .join("\n") + "\n"
  );
}
