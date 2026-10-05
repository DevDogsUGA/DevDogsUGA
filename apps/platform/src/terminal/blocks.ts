import {
  indent,
  lineWidth,
  MEASURE,
  padLine,
  span,
  textWidth,
  truncate,
  wrap,
  wrapText,
  type Line,
  type Span,
} from "./doc";
import { markdownLines } from "./markdown";
import { TONE, type Chip } from "./theme";

/**
 * The terminal's component vocabulary, and the whole of it.
 *
 * A route describes its page as a list of these and never as text: there is
 * no block that takes pre-rendered lines. That is the consistency guarantee.
 * Every heading on every path is the same `## heading`, every event row is
 * the same two lines, every URL is the same colour, because there is exactly
 * one function drawing each, and a page that wants something new has to add
 * it here, where it becomes available (and looks the same) everywhere.
 */
export type Block =
  /** The page's one-line pitch, bold. */
  | { type: "lead"; text: string }
  /** A paragraph. `mute` is body copy; `dim` is an aside. */
  | { type: "text"; text: string; tone?: "mute" | "dim" | "ink" }
  /** `## text`, in the page accent unless a colour is given. */
  | { type: "heading"; text: string; color?: string }
  /** A boxed feature: the hero event, a brief's status. */
  | { type: "card"; card: Card }
  /** The schedule list: a date column and a coloured bar per row. */
  | { type: "events"; items: EventItem[]; empty: string }
  /** A timeline of things with their own pages: issues, competitions. */
  | { type: "entries"; items: Entry[]; empty: string }
  /** Aligned label / value rows. */
  | { type: "fields"; rows: Field[] }
  /** Aligned label / URL rows. */
  | { type: "links"; items: LinkItem[] }
  /** A boxed status message: not found, browser only, cancelled. */
  | { type: "notice"; notice: Notice }
  /** Authored markdown (a competition brief, a support answer). */
  | { type: "markdown"; source: string }
  /** `curl` commands and what each prints. */
  | { type: "commands"; items: CommandItem[] };

export interface Card {
  color: string;
  chips: Chip[];
  /** Dim text beside the chips, e.g. the date. */
  meta?: string;
  title: string;
  /** Short facts under the title, joined with a dot: time, room. */
  facts?: string[];
  body?: string;
  action?: { label: string; url: string; kind: "cta" | "partner" };
}

export interface EventItem {
  /** `"WED Oct 7"`. */
  date: string;
  title: string;
  chip: Chip;
  facts: string[];
  cancelled?: boolean;
  /** A third line, e.g. the cancellation reason. */
  note?: string;
  /** A path on the site to `curl` for the detail. */
  path?: string;
}

export interface Entry {
  label: string;
  meta?: string;
  chip?: Chip;
  /** Drawn in the brand red with a filled marker: "latest", "open". */
  current?: boolean;
  headline?: string;
  text?: string;
  /** A path on the site to `curl` for the detail. */
  path?: string;
}

export interface Field {
  label: string;
  value: string;
  /** Draws the value as a link. */
  link?: boolean;
}

export interface LinkItem {
  label: string;
  url: string;
}

export interface Notice {
  tone: "info" | "warn" | "error";
  title: string;
  text?: string;
  /** Where to go instead; printed under the text. */
  url?: string;
}

export interface CommandItem {
  path: string;
  description: string;
}

/** The host every printed `curl` command names. */
export const CURL_HOST = "devdogsuga.org";

/**
 * A copy-pasteable command. Quoted when the path has a query string: `&`
 * would background the command and zsh refuses an unmatched `?` glob.
 */
export function curlCommand(path: string): string {
  const url = `${CURL_HOST}${path}`;
  return /[?&#*\s]/.test(url) ? `curl '${url}'` : `curl ${url}`;
}

const NOTICE_COLOR: Record<Notice["tone"], string> = {
  info: TONE.link,
  warn: "#fbbf24",
  error: TONE.brand,
};

function chipSpan(chip: Chip): Span {
  return span(` ${chip.label} `, {
    fg: TONE.onChip,
    bg: chip.color,
    bold: true,
  });
}

function dotted(facts: readonly string[]): Span[] {
  return facts.flatMap((fact, i) =>
    i === 0
      ? [span(fact, { fg: TONE.mute })]
      : [span(" · ", { fg: TONE.dim }), span(fact, { fg: TONE.mute })],
  );
}

/** A box `MEASURE` wide around content wrapped to fit inside it. */
function box(color: string, content: Line[]): Line[] {
  const inner = MEASURE - 4;
  const edge = { fg: color };
  return [
    [span(`╭${"─".repeat(inner + 2)}╮`, edge)],
    ...content.map((line) => [
      span("│ ", edge),
      ...padLine(line, inner),
      span(" │", edge),
    ]),
    [span(`╰${"─".repeat(inner + 2)}╯`, edge)],
  ];
}

const BOX_INNER = MEASURE - 4;

function renderCard(card: Card): Line[] {
  const content: Line[] = [];
  const head: Line = card.chips.flatMap((chip, i) =>
    i === 0 ? [chipSpan(chip)] : [span(" "), chipSpan(chip)],
  );
  if (card.meta) head.push(span(`  ${card.meta}`, { fg: TONE.dim }));
  if (head.length > 0) content.push(head, []);
  content.push(
    ...wrapText(card.title, BOX_INNER, { fg: TONE.ink, bold: true }),
  );
  if (card.facts?.length) content.push(...wrap(dotted(card.facts), BOX_INNER));
  if (card.body) {
    content.push([], ...wrapText(card.body, BOX_INNER, { fg: TONE.mute }));
  }
  if (card.action) {
    const { label, url, kind } = card.action;
    content.push(
      [],
      ...wrap(
        [
          kind === "partner"
            ? span("with ", { fg: TONE.dim })
            : span("→ ", { fg: card.color }),
          span(label, { fg: TONE.ink, bold: true }),
          span("  "),
          span(url, { fg: TONE.link }),
        ],
        BOX_INNER,
      ),
    );
  }
  return box(card.color, content);
}

const DATE_COLUMN = 11;

function renderEvents(items: readonly EventItem[], empty: string): Line[] {
  if (items.length === 0) return wrapText(empty, MEASURE, { fg: TONE.dim });
  const out: Line[] = [];
  const hang = DATE_COLUMN + 2;
  items.forEach((item, i) => {
    if (i > 0) out.push([]);
    const bar = span("▌ ", { fg: item.cancelled ? TONE.dim : item.chip.color });
    const pad = span(" ".repeat(DATE_COLUMN));
    const titleLines = wrapText(item.title, MEASURE - hang, {
      fg: item.cancelled ? TONE.dim : TONE.ink,
      bold: !item.cancelled,
    });
    titleLines.forEach((line, j) =>
      out.push([
        j === 0 ? span(item.date.padEnd(DATE_COLUMN), { fg: TONE.dim }) : pad,
        bar,
        ...line,
      ]),
    );
    const chip = item.cancelled
      ? span("Cancelled", { fg: TONE.brand, bold: true })
      : span(item.chip.label, { fg: item.chip.color });
    const detail = [
      chip,
      ...item.facts.flatMap((f) => [
        span(" · ", { fg: TONE.dim }),
        span(f, { fg: TONE.mute }),
      ]),
    ];
    for (const line of wrap(detail, MEASURE - hang))
      out.push([pad, bar, ...line]);
    if (item.note) {
      for (const line of wrapText(item.note, MEASURE - hang, {
        fg: TONE.dim,
      })) {
        out.push([pad, bar, ...line]);
      }
    }
    if (item.path) {
      out.push([pad, bar, span(curlCommand(item.path), { fg: TONE.link })]);
    }
  });
  return out;
}

function renderEntries(items: readonly Entry[], empty: string): Line[] {
  if (items.length === 0) return wrapText(empty, MEASURE, { fg: TONE.dim });
  const out: Line[] = [];
  const rail: Line = [span("│   ", { fg: TONE.dim })];
  const bodyWidth = MEASURE - 4;
  items.forEach((item, i) => {
    if (i > 0) out.push([span("│", { fg: TONE.dim })]);
    const head: Line = [
      item.current
        ? span("● ", { fg: TONE.brand })
        : span("○ ", { fg: TONE.dim }),
      span(item.label, {
        fg: item.current ? TONE.brand : TONE.ink,
        bold: true,
      }),
    ];
    if (item.meta) head.push(span(`  ${item.meta}`, { fg: TONE.dim }));
    if (item.chip) head.push(span("  "), chipSpan(item.chip));
    out.push(head);
    const body: Line[] = [];
    if (item.headline) {
      body.push(
        ...wrapText(item.headline, bodyWidth, { fg: TONE.ink, bold: true }),
      );
    }
    if (item.text)
      body.push(...wrapText(item.text, bodyWidth, { fg: TONE.mute }));
    if (item.path) {
      body.push([
        span("$ ", { fg: TONE.dim }),
        span(curlCommand(item.path), { fg: TONE.link }),
      ]);
    }
    out.push(...indent(body, rail));
  });
  return out;
}

function renderPairs(
  rows: readonly { label: string; value: string; link?: boolean }[],
): Line[] {
  const column = Math.min(
    Math.max(...rows.map((row) => textWidth(row.label))) + 2,
    24,
  );
  const out: Line[] = [];
  for (const row of rows) {
    const style = { fg: row.link ? TONE.link : TONE.ink };
    const label = span(truncate(row.label, column - 2).padEnd(column), {
      fg: TONE.dim,
    });
    const beside = wrapText(row.value, MEASURE - column, style);
    // A value with a word too long to sit beside its label (a long URL)
    // goes under it instead, where it has the whole measure.
    if (beside.some((line) => lineWidth(line) > MEASURE - column)) {
      out.push([span(row.label, { fg: TONE.dim })]);
      out.push(
        ...indent(wrapText(row.value, MEASURE - 2, style), [span("  ")]),
      );
      continue;
    }
    beside.forEach((line, i) =>
      out.push([i === 0 ? label : span(" ".repeat(column)), ...line]),
    );
  }
  return out;
}

function renderNotice(notice: Notice): Line[] {
  const color = NOTICE_COLOR[notice.tone];
  const content: Line[] = [
    ...wrapText(notice.title, BOX_INNER, { fg: color, bold: true }),
  ];
  if (notice.text) {
    content.push(...wrapText(notice.text, BOX_INNER, { fg: TONE.mute }));
  }
  if (notice.url) content.push([], [span(notice.url, { fg: TONE.link })]);
  return box(color, content);
}

function renderCommands(items: readonly CommandItem[]): Line[] {
  const column =
    Math.max(...items.map((item) => textWidth(curlCommand(item.path)))) + 2;
  const out: Line[] = [];
  for (const item of items) {
    const command: Line = [span(curlCommand(item.path), { fg: TONE.link })];
    // Side by side when the description still gets a readable measure,
    // otherwise stacked under its command.
    if (MEASURE - column >= 36) {
      const [first = [], ...rest] = wrapText(
        item.description,
        MEASURE - column,
        {
          fg: TONE.mute,
        },
      );
      out.push([...padLine(command, column), ...first]);
      out.push(...indent(rest, [span(" ".repeat(column))]));
    } else {
      out.push(command);
      out.push(
        ...indent(wrapText(item.description, MEASURE - 4, { fg: TONE.mute }), [
          span("    "),
        ]),
      );
    }
  }
  return out;
}

/** Draws one block, unindented, at most `MEASURE` columns wide. */
export function renderBlock(block: Block, accent: string): Line[] {
  switch (block.type) {
    case "lead":
      return wrapText(block.text, MEASURE, { fg: TONE.ink, bold: true });
    case "text":
      return wrapText(block.text, MEASURE, { fg: TONE[block.tone ?? "mute"] });
    case "heading":
      return [
        [span(`## ${block.text}`, { fg: block.color ?? accent, bold: true })],
      ];
    case "card":
      return renderCard(block.card);
    case "events":
      return renderEvents(block.items, block.empty);
    case "entries":
      return renderEntries(block.items, block.empty);
    case "fields":
      return renderPairs(block.rows);
    case "links":
      return renderPairs(
        block.items.map((item) => ({
          label: item.label,
          value: item.url,
          link: true,
        })),
      );
    case "notice":
      return renderNotice(block.notice);
    case "markdown":
      return markdownLines(block.source, accent);
    case "commands":
      return renderCommands(block.items);
  }
}
