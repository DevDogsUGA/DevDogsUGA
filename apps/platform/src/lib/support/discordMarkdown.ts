/**
 * A small parser from Discord's markdown flavor to an AST, and nothing else:
 * no HTML, no React. `DiscordMarkdown.tsx` walks this tree to render it, and
 * this module stays dependency-free and independently testable because
 * Discord's dialect (mentions, timestamps, spoilers, `>>>`) has no ready-made
 * parser on npm that gets all of it right, and pulling in a general markdown
 * engine just to bolt Discord's extensions on top would mean fighting its
 * block/inline split instead of using it.
 *
 * The grammar here is intentionally forgiving: anything that doesn't parse as
 * a construct falls through to plain text rather than throwing, because the
 * input is untrusted chat content and a message that fails to render is worse
 * than one that renders a little wrong.
 */

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "underline"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "spoiler"; children: InlineNode[] }
  | {
      type: "link";
      url: string;
      children: InlineNode[];
      suppressEmbed: boolean;
    }
  | { type: "userMention"; id: string }
  | { type: "roleMention"; id: string }
  | { type: "channelMention"; id: string }
  | { type: "slashCommand"; name: string }
  | { type: "emoji"; id: string; name: string; animated: boolean }
  | { type: "timestamp"; unix: number; style: TimestampStyle }
  | { type: "everyone" }
  | { type: "here" }
  | { type: "break" };

export type TimestampStyle = "t" | "T" | "d" | "D" | "f" | "F" | "R";

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "heading"; depth: 1 | 2 | 3; children: InlineNode[] }
  | { type: "subtext"; children: InlineNode[] }
  | { type: "quote"; children: BlockNode[] }
  | { type: "codeBlock"; lang: string | null; value: string }
  | { type: "list"; ordered: boolean; start: number; items: BlockNode[][] };

const TIMESTAMP_STYLES = new Set<TimestampStyle>([
  "t",
  "T",
  "d",
  "D",
  "f",
  "F",
  "R",
]);

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

/**
 * Splits a message into lines and folds them into blocks. Discord's block
 * grammar is line-oriented (a fence opens/closes on its own line, a quote is
 * a run of `>`-prefixed lines, a list is a run of `- `/`1. ` lines), so this
 * walks lines with an index cursor rather than a single regex pass.
 */
export function parseDiscordMarkdown(content: string): BlockNode[] {
  const lines = content.split("\n");
  return parseBlocks(lines, 0, lines.length);
}

function parseBlocks(lines: string[], start: number, end: number): BlockNode[] {
  const blocks: BlockNode[] = [];
  let i = start;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({
      type: "paragraph",
      children: parseInline(paragraph.join("\n")),
    });
    paragraph = [];
  };

  while (i < end) {
    const line = lines[i]!;

    // Fenced code block: ```lang\n...\n```. An unterminated fence runs to the
    // end of the message rather than swallowing nothing, since Discord itself
    // renders it that way.
    const fenceMatch = /^```([^\n`]*)$/.exec(line);
    if (fenceMatch) {
      flushParagraph();
      const lang = fenceMatch[1]!.trim() || null;
      const body: string[] = [];
      let j = i + 1;
      while (j < end && lines[j] !== "```") {
        body.push(lines[j]!);
        j++;
      }
      blocks.push({ type: "codeBlock", lang, value: body.join("\n") });
      i = j + 1;
      continue;
    }

    // `>>> ` quotes every remaining line of the message (Discord's "block
    // quote to the end" form); a lone `> ` quotes only the contiguous run.
    const fullQuoteMatch = /^>>> ?(.*)$/.exec(line);
    if (fullQuoteMatch) {
      flushParagraph();
      const rest = [fullQuoteMatch[1]!, ...lines.slice(i + 1, end)];
      blocks.push({
        type: "quote",
        children: parseBlocks(rest, 0, rest.length),
      });
      i = end;
      continue;
    }

    const quoteMatch = /^> ?(.*)$/.exec(line);
    if (quoteMatch) {
      flushParagraph();
      const quoted: string[] = [quoteMatch[1]!];
      let j = i + 1;
      while (j < end) {
        const m = /^> ?(.*)$/.exec(lines[j]!);
        if (!m) break;
        quoted.push(m[1]!);
        j++;
      }
      blocks.push({
        type: "quote",
        children: parseBlocks(quoted, 0, quoted.length),
      });
      i = j;
      continue;
    }

    const headingMatch = /^(#{1,3}) (.*)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      const depth = headingMatch[1]!.length as 1 | 2 | 3;
      blocks.push({
        type: "heading",
        depth,
        children: parseInline(headingMatch[2]!),
      });
      i++;
      continue;
    }

    const subtextMatch = /^-# (.*)$/.exec(line);
    if (subtextMatch) {
      flushParagraph();
      blocks.push({ type: "subtext", children: parseInline(subtextMatch[1]!) });
      i++;
      continue;
    }

    const ulMatch = /^[-*] (.*)$/.exec(line);
    const olMatch = /^(\d+)\. (.*)$/.exec(line);
    if (ulMatch || olMatch) {
      flushParagraph();
      const ordered = !!olMatch;
      const start_ = olMatch ? Number(olMatch[1]) : 1;
      const items: BlockNode[][] = [];
      let j = i;
      while (j < end) {
        const itemLine = lines[j]!;
        const itemMatch = ordered
          ? /^\d+\. (.*)$/.exec(itemLine)
          : /^[-*] (.*)$/.exec(itemLine);
        if (!itemMatch) break;
        // Simple nesting: a `  ` (2-space) indented continuation line is part
        // of the same item's text rather than a new paragraph. Deeper nested
        // lists are out of scope -- Discord's own client barely renders them.
        const itemBody = [itemMatch[1]!];
        let k = j + 1;
        while (k < end && /^ {2,}\S/.test(lines[k]!)) {
          itemBody.push(lines[k]!.replace(/^ {2}/, ""));
          k++;
        }
        items.push(parseBlocks(itemBody, 0, itemBody.length));
        j = k;
      }
      blocks.push({ type: "list", ordered, start: start_, items });
      i = j;
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      i++;
      continue;
    }

    paragraph.push(line);
    i++;
  }

  flushParagraph();
  return blocks;
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

/**
 * Inline tokens in priority order. Code spans are matched first and their
 * contents never get scanned again (Discord doesn't parse emphasis inside
 * code), so this is a single left-to-right scan rather than a tokenize/parse
 * split: at each position, try every pattern that can start there and take
 * the longest/first match, consume it, and recurse on the remainder for
 * anything that composes (bold, italic, links, spoilers).
 */
function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";
  let i = 0;

  const flushText = () => {
    if (buffer === "") return;
    nodes.push({ type: "text", value: buffer });
    buffer = "";
  };

  while (i < text.length) {
    const rest = text.slice(i);

    // Backslash escape: the next character is taken literally.
    if (rest.startsWith("\\") && i + 1 < text.length) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (rest.startsWith("\n")) {
      flushText();
      nodes.push({ type: "break" });
      i += 1;
      continue;
    }

    // Code spans: the double-backtick fence first (lazily matched, so it can
    // contain single backticks) so ``a`b`` doesn't split on the inner one.
    const codeMatch = /^(?:``([\s\S]+?)``|`([^`\n]+)`)/.exec(rest);
    if (codeMatch) {
      flushText();
      nodes.push({ type: "code", value: (codeMatch[1] ?? codeMatch[2])! });
      i += codeMatch[0].length;
      continue;
    }

    // ***bold italic*** before ** and * so the triple form doesn't get read
    // as bold followed by a stray italic marker.
    const boldItalicMatch = /^\*\*\*([\s\S]+?)\*\*\*/.exec(rest);
    if (boldItalicMatch) {
      flushText();
      nodes.push({
        type: "bold",
        children: [
          { type: "italic", children: parseInline(boldItalicMatch[1]!) },
        ],
      });
      i += boldItalicMatch[0].length;
      continue;
    }

    const boldMatch = /^\*\*([\s\S]+?)\*\*/.exec(rest);
    if (boldMatch) {
      flushText();
      nodes.push({ type: "bold", children: parseInline(boldMatch[1]!) });
      i += boldMatch[0].length;
      continue;
    }

    const underlineMatch = /^__([\s\S]+?)__/.exec(rest);
    if (underlineMatch) {
      flushText();
      nodes.push({
        type: "underline",
        children: parseInline(underlineMatch[1]!),
      });
      i += underlineMatch[0].length;
      continue;
    }

    const strikeMatch = /^~~([\s\S]+?)~~/.exec(rest);
    if (strikeMatch) {
      flushText();
      nodes.push({ type: "strike", children: parseInline(strikeMatch[1]!) });
      i += strikeMatch[0].length;
      continue;
    }

    const spoilerMatch = /^\|\|([\s\S]+?)\|\|/.exec(rest);
    if (spoilerMatch) {
      flushText();
      nodes.push({ type: "spoiler", children: parseInline(spoilerMatch[1]!) });
      i += spoilerMatch[0].length;
      continue;
    }

    // `*italic*` -- requires non-space content immediately inside (Discord's
    // own rule, which keeps "5 * 3 * 2" from turning into italic text), and
    // both markers must be a single, undoubled star: the lookaround on each
    // side keeps this from treating one side of a nested `**bold**` as its
    // own close, so "*a **b** c*" reads as italic wrapping a bold, not
    // italic ending right after the first "**".
    const italicStarMatch = /^\*([^\s*][\s\S]*?)(?<!\*)\*(?!\*)/.exec(rest);
    if (italicStarMatch) {
      flushText();
      nodes.push({
        type: "italic",
        children: parseInline(italicStarMatch[1]!),
      });
      i += italicStarMatch[0].length;
      continue;
    }

    const italicUnderscoreMatch = /^_([^\s_][\s\S]*?)(?<!_)_(?!_)/.exec(rest);
    if (italicUnderscoreMatch) {
      flushText();
      nodes.push({
        type: "italic",
        children: parseInline(italicUnderscoreMatch[1]!),
      });
      i += italicUnderscoreMatch[0].length;
      continue;
    }

    // Masked links: [text](url) or [text](<url>). The angle-bracket form
    // suppresses Discord's embed preview but renders identically as a link.
    const linkMatch = /^\[([^\]]*)\]\((<)?([^)\s>]+)>?\)/.exec(rest);
    if (linkMatch) {
      const url = linkMatch[3]!;
      if (isHttpUrl(url)) {
        flushText();
        nodes.push({
          type: "link",
          url,
          children: parseInline(linkMatch[1]!),
          suppressEmbed: !!linkMatch[2],
        });
        i += linkMatch[0].length;
        continue;
      }
    }

    // `<https://...>`: an autolink with its embed suppressed, no label.
    const suppressedAutolinkMatch = /^<(https?:\/\/[^\s>]+)>/.exec(rest);
    if (suppressedAutolinkMatch) {
      const url = suppressedAutolinkMatch[1]!;
      flushText();
      nodes.push({
        type: "link",
        url,
        children: [{ type: "text", value: url }],
        suppressEmbed: true,
      });
      i += suppressedAutolinkMatch[0].length;
      continue;
    }

    // Slash command mention: </name:id> renders as plain "/name" text, no
    // link -- the id only identifies which command version, which the widget
    // has no use for.
    const slashMatch = /^<\/([a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*):(\d+)>/.exec(
      rest,
    );
    if (slashMatch) {
      flushText();
      nodes.push({ type: "slashCommand", name: slashMatch[1]! });
      i += slashMatch[0].length;
      continue;
    }

    // Custom emoji: <:name:id> or animated <a:name:id>.
    const emojiMatch = /^<(a)?:(\w+):(\d+)>/.exec(rest);
    if (emojiMatch) {
      flushText();
      nodes.push({
        type: "emoji",
        id: emojiMatch[3]!,
        name: emojiMatch[2]!,
        animated: !!emojiMatch[1],
      });
      i += emojiMatch[0].length;
      continue;
    }

    // Timestamp: <t:unix> or <t:unix:STYLE>. The style is captured loosely
    // and validated against the known set below, so an unrecognized style
    // letter still parses as a timestamp (Discord's own client falls back to
    // "f" rather than showing broken markup) instead of rendering literally.
    const timestampMatch = /^<t:(-?\d+)(?::([A-Za-z]+))?>/.exec(rest);
    if (timestampMatch) {
      flushText();
      const rawStyle = timestampMatch[2];
      const style =
        rawStyle && TIMESTAMP_STYLES.has(rawStyle as TimestampStyle)
          ? (rawStyle as TimestampStyle)
          : "f";
      nodes.push({ type: "timestamp", unix: Number(timestampMatch[1]), style });
      i += timestampMatch[0].length;
      continue;
    }

    // User mention: <@id> or <@!id> (the `!` marked a nickname-having member
    // in the old API; both address the same user).
    const userMatch = /^<@!?(\d+)>/.exec(rest);
    if (userMatch) {
      flushText();
      nodes.push({ type: "userMention", id: userMatch[1]! });
      i += userMatch[0].length;
      continue;
    }

    const roleMatch = /^<@&(\d+)>/.exec(rest);
    if (roleMatch) {
      flushText();
      nodes.push({ type: "roleMention", id: roleMatch[1]! });
      i += roleMatch[0].length;
      continue;
    }

    const channelMatch = /^<#(\d+)>/.exec(rest);
    if (channelMatch) {
      flushText();
      nodes.push({ type: "channelMention", id: channelMatch[1]! });
      i += channelMatch[0].length;
      continue;
    }

    if (rest.startsWith("@everyone")) {
      flushText();
      nodes.push({ type: "everyone" });
      i += "@everyone".length;
      continue;
    }

    if (rest.startsWith("@here")) {
      flushText();
      nodes.push({ type: "here" });
      i += "@here".length;
      continue;
    }

    // Bare autolink: a raw http(s) URL with no surrounding markup. Stops at
    // whitespace or a trailing `)`/`>`/punctuation that more plausibly closes
    // enclosing prose than belongs to the URL.
    const bareUrlMatch = /^https?:\/\/[^\s<>]+/.exec(rest);
    if (bareUrlMatch) {
      let url = bareUrlMatch[0];
      // Trim trailing punctuation that's almost always sentence punctuation,
      // not part of the URL ("check this out: https://x.com/foo." at the end
      // of a sentence).
      const trailing = /[).,!?;:]+$/.exec(url);
      if (trailing) url = url.slice(0, -trailing[0].length);
      if (url.length > 0) {
        flushText();
        nodes.push({
          type: "link",
          url,
          children: [{ type: "text", value: url }],
          suppressEmbed: false,
        });
        i += url.length;
        continue;
      }
    }

    buffer += rest[0];
    i += 1;
  }

  flushText();
  return nodes;
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Jumbo-emoji rule
// ---------------------------------------------------------------------------

/**
 * True when a message is entirely emoji (custom and/or Unicode) plus
 * whitespace -- Discord's rule for rendering them oversized ("jumbo"). Custom
 * emoji are stripped by their `<a?:name:id>` markup; what's left must be only
 * whitespace and Unicode emoji-range code points for the message to qualify.
 */
export function isEmojiOnly(content: string): boolean {
  const stripped = content.replace(/<a?:\w+:\d+>/g, "");
  const withoutWhitespace = stripped.replace(/\s/g, "");
  if (withoutWhitespace.length === 0) {
    // All custom emoji (and maybe whitespace): still jumbo-eligible as long
    // as there was at least one emoji in the original content.
    return stripped.length !== content.length;
  }
  // Emoji, presentation selectors, ZWJ, skin tone modifiers, and regional
  // indicators (flags) -- the code point ranges Unicode emoji are drawn from.
  const emojiPattern =
    /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|‍|️|[\u{1F3FB}-\u{1F3FF}]|[\u{1F1E6}-\u{1F1FF}])+$/u;
  return emojiPattern.test(withoutWhitespace);
}
