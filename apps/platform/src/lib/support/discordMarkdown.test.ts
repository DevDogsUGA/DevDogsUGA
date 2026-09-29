import { describe, expect, it } from "vitest";
import {
  isEmojiOnly,
  parseDiscordMarkdown,
  type InlineNode,
} from "./discordMarkdown";

/** Parses a single-paragraph message and returns just its inline children. */
function inline(content: string): InlineNode[] {
  const blocks = parseDiscordMarkdown(content);
  expect(blocks).toHaveLength(1);
  expect(blocks[0]!.type).toBe("paragraph");
  return (blocks[0] as { type: "paragraph"; children: InlineNode[] }).children;
}

describe("parseDiscordMarkdown: blocks", () => {
  it("parses a plain paragraph", () => {
    expect(parseDiscordMarkdown("hello world")).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "hello world" }] },
    ]);
  });

  it("keeps a single newline as a line break within one paragraph", () => {
    const blocks = parseDiscordMarkdown("line one\nline two");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: "paragraph",
      children: [
        { type: "text", value: "line one" },
        { type: "break" },
        { type: "text", value: "line two" },
      ],
    });
  });

  it("splits a blank line into two paragraphs", () => {
    const blocks = parseDiscordMarkdown("first\n\nsecond");
    expect(blocks).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "first" }] },
      { type: "paragraph", children: [{ type: "text", value: "second" }] },
    ]);
  });

  it("parses a fenced code block with a language", () => {
    const blocks = parseDiscordMarkdown("```ts\nconst x = 1;\n```");
    expect(blocks).toEqual([
      { type: "codeBlock", lang: "ts", value: "const x = 1;" },
    ]);
  });

  it("parses a fenced code block with no language", () => {
    const blocks = parseDiscordMarkdown("```\nplain\n```");
    expect(blocks).toEqual([{ type: "codeBlock", lang: null, value: "plain" }]);
  });

  it("runs an unterminated fence to the end of the message", () => {
    const blocks = parseDiscordMarkdown("```js\nconsole.log(1)");
    expect(blocks).toEqual([
      { type: "codeBlock", lang: "js", value: "console.log(1)" },
    ]);
  });

  it("does not parse markdown inside a code block", () => {
    const blocks = parseDiscordMarkdown("```\n**not bold**\n```");
    expect(blocks).toEqual([
      { type: "codeBlock", lang: null, value: "**not bold**" },
    ]);
  });

  it("parses a single-line block quote", () => {
    const blocks = parseDiscordMarkdown("> quoted text");
    expect(blocks).toEqual([
      {
        type: "quote",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", value: "quoted text" }],
          },
        ],
      },
    ]);
  });

  it("groups contiguous quote lines into one quote block", () => {
    const blocks = parseDiscordMarkdown("> line one\n> line two");
    expect(blocks).toEqual([
      {
        type: "quote",
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", value: "line one" },
              { type: "break" },
              { type: "text", value: "line two" },
            ],
          },
        ],
      },
    ]);
  });

  it("quotes the whole rest of the message with >>>", () => {
    const blocks = parseDiscordMarkdown(">>> first\nsecond\nthird");
    expect(blocks).toEqual([
      {
        type: "quote",
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", value: "first" },
              { type: "break" },
              { type: "text", value: "second" },
              { type: "break" },
              { type: "text", value: "third" },
            ],
          },
        ],
      },
    ]);
  });

  it("parses headers of each depth", () => {
    expect(parseDiscordMarkdown("# H1")[0]).toEqual({
      type: "heading",
      depth: 1,
      children: [{ type: "text", value: "H1" }],
    });
    expect(parseDiscordMarkdown("## H2")[0]).toEqual({
      type: "heading",
      depth: 2,
      children: [{ type: "text", value: "H2" }],
    });
    expect(parseDiscordMarkdown("### H3")[0]).toEqual({
      type: "heading",
      depth: 3,
      children: [{ type: "text", value: "H3" }],
    });
  });

  it("does not treat a mid-line # as a header", () => {
    const blocks = parseDiscordMarkdown("see issue #123 for details");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "see issue #123 for details" }],
      },
    ]);
  });

  it("parses subtext", () => {
    expect(parseDiscordMarkdown("-# fine print")[0]).toEqual({
      type: "subtext",
      children: [{ type: "text", value: "fine print" }],
    });
  });

  it("parses an unordered list with - and *", () => {
    const blocks = parseDiscordMarkdown("- one\n* two");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        start: 1,
        items: [
          [{ type: "paragraph", children: [{ type: "text", value: "one" }] }],
          [{ type: "paragraph", children: [{ type: "text", value: "two" }] }],
        ],
      },
    ]);
  });

  it("parses an ordered list, preserving its start number", () => {
    const blocks = parseDiscordMarkdown("5. five\n6. six");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: true,
        start: 5,
        items: [
          [{ type: "paragraph", children: [{ type: "text", value: "five" }] }],
          [{ type: "paragraph", children: [{ type: "text", value: "six" }] }],
        ],
      },
    ]);
  });

  it("folds an indented continuation line into the preceding list item", () => {
    const blocks = parseDiscordMarkdown("- one\n  more of one\n- two");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        start: 1,
        items: [
          [
            {
              type: "paragraph",
              children: [
                { type: "text", value: "one" },
                { type: "break" },
                { type: "text", value: "more of one" },
              ],
            },
          ],
          [{ type: "paragraph", children: [{ type: "text", value: "two" }] }],
        ],
      },
    ]);
  });
});

describe("parseDiscordMarkdown: inline emphasis", () => {
  it("parses bold", () => {
    expect(inline("**bold**")).toEqual([
      { type: "bold", children: [{ type: "text", value: "bold" }] },
    ]);
  });

  it("parses italic with asterisks", () => {
    expect(inline("*italic*")).toEqual([
      { type: "italic", children: [{ type: "text", value: "italic" }] },
    ]);
  });

  it("parses italic with underscores", () => {
    expect(inline("_italic_")).toEqual([
      { type: "italic", children: [{ type: "text", value: "italic" }] },
    ]);
  });

  it("parses underline", () => {
    expect(inline("__underline__")).toEqual([
      { type: "underline", children: [{ type: "text", value: "underline" }] },
    ]);
  });

  it("parses strikethrough", () => {
    expect(inline("~~strike~~")).toEqual([
      { type: "strike", children: [{ type: "text", value: "strike" }] },
    ]);
  });

  it("parses spoilers", () => {
    expect(inline("||secret||")).toEqual([
      { type: "spoiler", children: [{ type: "text", value: "secret" }] },
    ]);
  });

  it("parses bold italic", () => {
    expect(inline("***both***")).toEqual([
      {
        type: "bold",
        children: [
          { type: "italic", children: [{ type: "text", value: "both" }] },
        ],
      },
    ]);
  });

  it("does not treat 5 * 3 as italic", () => {
    expect(inline("5 * 3 * 2")).toEqual([{ type: "text", value: "5 * 3 * 2" }]);
  });

  it("nests bold inside italic", () => {
    expect(inline("*a **b** c*")).toEqual([
      {
        type: "italic",
        children: [
          { type: "text", value: "a " },
          { type: "bold", children: [{ type: "text", value: "b" }] },
          { type: "text", value: " c" },
        ],
      },
    ]);
  });

  it("nests emphasis inside a spoiler", () => {
    expect(inline("||**hidden bold**||")).toEqual([
      {
        type: "spoiler",
        children: [
          { type: "bold", children: [{ type: "text", value: "hidden bold" }] },
        ],
      },
    ]);
  });

  it("parses inline code with a single backtick", () => {
    expect(inline("`code`")).toEqual([{ type: "code", value: "code" }]);
  });

  it("parses inline code with double backticks to allow an inner backtick", () => {
    expect(inline("``a`b``")).toEqual([{ type: "code", value: "a`b" }]);
  });

  it("does not parse markdown inside inline code", () => {
    expect(inline("`**not bold**`")).toEqual([
      { type: "code", value: "**not bold**" },
    ]);
  });

  it("handles backslash escapes", () => {
    expect(inline("\\*\\*not bold\\*\\*")).toEqual([
      { type: "text", value: "**not bold**" },
    ]);
  });
});

describe("parseDiscordMarkdown: links", () => {
  it("parses a masked link", () => {
    expect(inline("[click here](https://example.com)")).toEqual([
      {
        type: "link",
        url: "https://example.com",
        children: [{ type: "text", value: "click here" }],
        suppressEmbed: false,
      },
    ]);
  });

  it("parses a masked link with a suppressed-embed target", () => {
    expect(inline("[click here](<https://example.com>)")).toEqual([
      {
        type: "link",
        url: "https://example.com",
        children: [{ type: "text", value: "click here" }],
        suppressEmbed: true,
      },
    ]);
  });

  it("renders a masked link to a non-http scheme as plain text", () => {
    expect(inline("[run me](javascript:alert(1))")).toEqual([
      { type: "text", value: "[run me](javascript:alert(1))" },
    ]);
  });

  it("autolinks a bare https URL", () => {
    expect(inline("see https://example.com/path for more")).toEqual([
      { type: "text", value: "see " },
      {
        type: "link",
        url: "https://example.com/path",
        children: [{ type: "text", value: "https://example.com/path" }],
        suppressEmbed: false,
      },
      { type: "text", value: " for more" },
    ]);
  });

  it("trims trailing sentence punctuation off a bare autolink", () => {
    expect(inline("go to https://example.com.")).toEqual([
      { type: "text", value: "go to " },
      {
        type: "link",
        url: "https://example.com",
        children: [{ type: "text", value: "https://example.com" }],
        suppressEmbed: false,
      },
      { type: "text", value: "." },
    ]);
  });

  it("parses a suppressed-embed autolink", () => {
    expect(inline("<https://example.com>")).toEqual([
      {
        type: "link",
        url: "https://example.com",
        children: [{ type: "text", value: "https://example.com" }],
        suppressEmbed: true,
      },
    ]);
  });
});

describe("parseDiscordMarkdown: mentions and tokens", () => {
  it("parses a user mention", () => {
    expect(inline("<@123>")).toEqual([{ type: "userMention", id: "123" }]);
  });

  it("parses a legacy nickname-form user mention", () => {
    expect(inline("<@!123>")).toEqual([{ type: "userMention", id: "123" }]);
  });

  it("parses a role mention", () => {
    expect(inline("<@&456>")).toEqual([{ type: "roleMention", id: "456" }]);
  });

  it("parses a channel mention", () => {
    expect(inline("<#789>")).toEqual([{ type: "channelMention", id: "789" }]);
  });

  it("parses a slash command mention as plain text", () => {
    expect(inline("</ban:987654321>")).toEqual([
      { type: "slashCommand", name: "ban" },
    ]);
  });

  it("parses a slash command mention with a subcommand", () => {
    expect(inline("</tag create:987654321>")).toEqual([
      { type: "slashCommand", name: "tag create" },
    ]);
  });

  it("parses a custom emoji", () => {
    expect(inline("<:pog:111>")).toEqual([
      { type: "emoji", id: "111", name: "pog", animated: false },
    ]);
  });

  it("parses an animated custom emoji", () => {
    expect(inline("<a:pogspin:222>")).toEqual([
      { type: "emoji", id: "222", name: "pogspin", animated: true },
    ]);
  });

  it("parses a bare timestamp with the default style", () => {
    expect(inline("<t:1700000000>")).toEqual([
      { type: "timestamp", unix: 1700000000, style: "f" },
    ]);
  });

  it("parses a styled timestamp", () => {
    expect(inline("<t:1700000000:R>")).toEqual([
      { type: "timestamp", unix: 1700000000, style: "R" },
    ]);
  });

  it("falls back to the default style for an unrecognized style letter", () => {
    expect(inline("<t:1700000000:Q>")).toEqual([
      { type: "timestamp", unix: 1700000000, style: "f" },
    ]);
  });

  it("parses @everyone and @here", () => {
    expect(inline("@everyone please read @here too")).toEqual([
      { type: "everyone" },
      { type: "text", value: " please read " },
      { type: "here" },
      { type: "text", value: " too" },
    ]);
  });
});

describe("isEmojiOnly", () => {
  it("is true for a single custom emoji", () => {
    expect(isEmojiOnly("<:pog:111>")).toBe(true);
  });

  it("is true for multiple custom emoji with whitespace between them", () => {
    expect(isEmojiOnly("<:pog:111>  <a:spin:222>")).toBe(true);
  });

  it("is true for a Unicode emoji", () => {
    expect(isEmojiOnly("🔥")).toBe(true);
  });

  it("is true for a multi-codepoint Unicode emoji (ZWJ sequence)", () => {
    expect(isEmojiOnly("👍🏽")).toBe(true);
  });

  it("is false for emoji plus text", () => {
    expect(isEmojiOnly("nice 🔥")).toBe(false);
  });

  it("is false for plain text", () => {
    expect(isEmojiOnly("hello")).toBe(false);
  });

  it("is false for an empty message", () => {
    expect(isEmojiOnly("")).toBe(false);
  });

  it("is false for whitespace only", () => {
    expect(isEmojiOnly("   ")).toBe(false);
  });
});

describe("parseDiscordMarkdown: full messages", () => {
  it("parses a realistic multi-block message", () => {
    const content = [
      "# Heads up",
      "",
      "Please check <#123> before pinging <@456>.",
      "",
      "> quoted rule",
      "",
      "- step one",
      "- step **two**",
    ].join("\n");
    const blocks = parseDiscordMarkdown(content);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "quote",
      "list",
    ]);
  });
});
