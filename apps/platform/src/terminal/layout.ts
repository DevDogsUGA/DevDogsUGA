import { SITE, SOCIAL_LINKS } from "@devdogsuga/newsletter";
import { curlCommand, renderBlock, type Block } from "./blocks";
import {
  GUTTER,
  indent,
  lineWidth,
  MEASURE,
  padLine,
  serialize,
  span,
  textWidth,
  WIDTH,
  type Line,
} from "./doc";
import { banner } from "./font";
import { ACCENT, TONE, type Accent } from "./theme";

/**
 * The frame every terminal page is drawn in, so no route lays out its own
 * chrome. A route returns a `TerminalPage` (what it says) and this decides
 * how it looks: the same title bar, masthead, prompt and footer on every
 * path, the same 80 columns, the same gutters.
 */

/**
 * The masthead words, a closed list. A page names its SECTION here, never its
 * own title (a competition's name is copy, and copy belongs in the body where
 * it wraps); the list keeps the big type to a handful of words drawn from a
 * font that has every glyph they need.
 */
export const BANNERS = [
  "DEVDOGS",
  "CHANGELOG",
  "EVENTS",
  "DIRECTIONS",
  "COMPETITIONS",
  "COMMUNITY",
  "PARTNERS",
  "DOCS",
  "HELP",
  "404",
] as const;

export type Banner = (typeof BANNERS)[number];

export interface TerminalPage {
  banner: Banner;
  /** The section's hue, matching its `PageShell` accent on the site. */
  accent: Accent;
  /** At most two short lines beside the masthead, under "DevDogs". */
  aside?: readonly string[];
  /** The right end of the title bar: a date, a count. */
  status?: string;
  /** The prompt line, printed after `$ `. */
  command: string;
  body: readonly Block[];
}

export interface RenderOptions {
  /** The path the reader asked for; the footer's browser link. */
  path: string;
  color: boolean;
}

const DOTS = ["#a684ff", "#00a6f4", "#ffb900"] as const;

function titleBar(page: TerminalPage): Line {
  const dots: Line = DOTS.flatMap((fg, i) => [
    ...(i > 0 ? [span(" ")] : []),
    span("●", { fg }),
  ]);
  const title: Line = [
    span("devdogs - ", { fg: TONE.dim }),
    span(page.banner.toLowerCase(), { fg: ACCENT[page.accent] }),
    span(" - 80×24", { fg: TONE.dim }),
  ];
  const status: Line = page.status ? [span(page.status, { fg: TONE.dim })] : [];
  const inner = WIDTH - 2;
  const left = Math.floor((inner - lineWidth(title)) / 2) - lineWidth(dots);
  const right =
    inner - lineWidth(dots) - left - lineWidth(title) - lineWidth(status);
  return [
    span(" "),
    ...dots,
    span(" ".repeat(Math.max(1, left))),
    ...title,
    span(" ".repeat(Math.max(1, right))),
    ...status,
  ];
}

function rule(): Line {
  return [span("─".repeat(WIDTH), { fg: TONE.rule })];
}

function masthead(page: TerminalPage): Line[] {
  const glyphs = banner(`${page.banner}_`);
  const rows: Line[] = [0, 1, 2].map((r) =>
    glyphs.map((glyph) =>
      span(glyph.rows[r]!, {
        fg: glyph.char === "_" ? TONE.brand : TONE.ink,
      }),
    ),
  );
  const aside: Line[] = [
    [span("DevDogs", { fg: TONE.brand, bold: true })],
    ...(page.aside ?? [])
      .slice(0, 2)
      .map((text) => [span(text, { fg: TONE.mute })]),
  ];
  const column = lineWidth(rows[0]!) + 4;
  const fits = aside.every((line) => column + lineWidth(line) <= MEASURE);
  if (fits) {
    return rows.map((row, i) => [...padLine(row, column), ...(aside[i] ?? [])]);
  }
  return [...rows, [], ...aside];
}

function footer(path: string): Line[] {
  const socials = SOCIAL_LINKS.map((link): Line => [
    span(link.label.padEnd(10), { fg: TONE.dim }),
    span(link.url.replace(/^https:\/\//, "").replace(/\/?\?.*$/, ""), {
      fg: TONE.link,
    }),
  ]);
  const half = Math.ceil(socials.length / 2);
  const columns: Line[] = [];
  for (let i = 0; i < half; i++) {
    const left = socials[i]!;
    const right = socials[i + half];
    columns.push(right ? [...padLine(left, 38), ...right] : left);
  }
  const label = (text: string) => span(text.padEnd(22), { fg: TONE.dim });
  return [
    ...columns,
    [],
    [
      label("open in a browser:"),
      span(`${SITE}${path === "/" ? "" : path}`, { fg: TONE.link }),
    ],
    [label("everything else:"), span(curlCommand("/help"), { fg: TONE.ink })],
  ];
}

/** Every line of a page, before serialisation. Exposed for the layout tests. */
export function pageLines(page: TerminalPage, path: string): Line[] {
  const accent = ACCENT[page.accent];
  const gutter: Line = [span(" ".repeat(GUTTER))];
  const body: Line[] = [];
  for (const block of page.body) {
    if (body.length > 0) body.push([]);
    body.push(...renderBlock(block, accent));
  }
  return [
    titleBar(page),
    rule(),
    [],
    ...indent(masthead(page), gutter),
    [],
    [
      ...gutter,
      span("$ ", { fg: TONE.brand }),
      span(page.command, { fg: TONE.mute }),
    ],
    [],
    ...indent(body, gutter),
    [],
    rule(),
    ...indent(footer(path), gutter),
    [],
  ];
}

export function renderPage(page: TerminalPage, options: RenderOptions): string {
  return serialize(pageLines(page, options.path), options.color);
}

/** For tests: the widest visible line a page draws. */
export function widestLine(lines: readonly Line[]): number {
  return Math.max(
    ...lines.map((line) => textWidth(line.map((s) => s.text).join(""))),
  );
}
