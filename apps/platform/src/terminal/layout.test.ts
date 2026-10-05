// @vitest-environment node
import { ISSUES } from "@devdogsuga/newsletter";
import { describe, expect, it, vi } from "vitest";
import { curlCommand, type Block } from "./blocks";
import { WIDTH } from "./doc";
import { bannerWidth } from "./font";
import { BANNERS, renderPage, type TerminalPage } from "./layout";
import { changelogArchive, changelogIssue } from "./routes/changelog";
import { directions } from "./routes/events";
import { help } from "./routes/misc";
import type { TerminalRoute } from "./define";

// The route modules import the loaders, and through them the database client,
// whose package guards itself with `server-only`. Nothing here queries it.
vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/env", () => ({ env: { BASE_URL: "http://localhost:3000" } }));

const ESC = "\x1b";
const visible = (line: string) =>
  [...line.replace(/\x1b\[[\d;]*m/g, "")].length;

function check(page: TerminalPage, path = "/x") {
  const ansi = renderPage(page, { path, color: true });
  const plain = renderPage(page, { path, color: false });
  for (const line of plain.split("\n")) {
    // Only an unbreakable token (a long URL) may push a line past the
    // measure; wrapping never splits one, because a split URL can't be
    // copied out of a terminal.
    if (visible(line) > WIDTH) expect(line, line).toMatch(/\S{50,}/);
  }
  expect(plain).not.toContain(ESC);
  // Colour adds escape codes and nothing else.
  expect(ansi.replace(/\x1b\[[\d;]*m/g, "").replace(/ +$/gm, "")).toBe(plain);
  return plain;
}

const LONG =
  "A sentence long enough to wrap several times across the measure, with a URL https://devdogsuga.org/a/very/long/path/that/cannot/be/broken/because/copying/it/would/fail in the middle of it.";

const EVERY_BLOCK: Block[] = [
  { type: "lead", text: LONG },
  { type: "text", text: LONG },
  { type: "heading", text: "heading" },
  {
    type: "card",
    card: {
      color: "#ff0000",
      chips: [
        { label: "Workshop", color: "#00ff00" },
        { label: "Social", color: "#0000ff" },
      ],
      meta: "MON Oct 5",
      title: LONG,
      facts: ["6:00 – 7:30 PM", "DLW 124"],
      body: LONG,
      action: { kind: "cta", label: "RSVP", url: "https://example.com" },
    },
  },
  {
    type: "events",
    items: [
      {
        date: "WED Oct 14",
        title: LONG,
        chip: { label: "Build Session", color: "#00a6f4" },
        facts: ["6:00 – 7:00 PM", "DLW 124"],
        cancelled: true,
        note: "Weather.",
        path: "/events/2026-10-14",
      },
    ],
    empty: "none",
  },
  {
    type: "entries",
    items: [
      {
        label: "v1.0.0",
        meta: "Mon",
        current: true,
        headline: LONG,
        text: LONG,
        path: "/changelog/1.0.0",
      },
    ],
    empty: "none",
  },
  {
    type: "fields",
    rows: [{ label: "a very long label that is truncated", value: LONG }],
  },
  { type: "links", items: [{ label: "site", url: "https://devdogsuga.org" }] },
  {
    type: "notice",
    notice: {
      tone: "warn",
      title: LONG,
      text: LONG,
      url: "https://devdogsuga.org",
    },
  },
  {
    type: "markdown",
    source: `# Title\n\n${LONG}\n\n- one\n- two with **bold** and [a link](https://x.dev)\n\n1. first\n\n> quoted ${LONG}\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---`,
  },
  {
    type: "commands",
    items: [{ path: "/events?b=DLW&r=110", description: LONG }],
  },
];

describe("terminal layout", () => {
  it("draws every block inside 80 columns, with and without colour", () => {
    check({
      banner: "DEVDOGS",
      accent: "rose",
      aside: ["one", "two"],
      status: "now",
      command: "test",
      body: EVERY_BLOCK,
    });
  });

  it.each(BANNERS)("has every glyph the %s banner needs", (banner) => {
    expect(bannerWidth(`${banner}_`)).toBeLessThanOrEqual(WIDTH - 4);
    check({
      banner,
      accent: "cyan",
      aside: ["an aside long enough to push below"],
      command: "x",
      body: [],
    });
  });

  it("quotes commands a shell would mangle", () => {
    expect(curlCommand("/events")).toBe("curl devdogsuga.org/events");
    expect(curlCommand("/events/directions?b=DLW&r=110")).toBe(
      "curl 'devdogsuga.org/events/directions?b=DLW&r=110'",
    );
  });
});

async function render(
  route: TerminalRoute,
  path: string,
  params: Record<string, string> = {},
  search = "",
) {
  if (route.kind !== "terminal") throw new Error("not a terminal route");
  const result = await route.render({
    params,
    search: new URLSearchParams(search),
    path,
  });
  if (result.kind !== "page")
    throw new Error(`expected a page, got ${result.kind}`);
  return check(result.page, path);
}

describe("database-free routes", () => {
  it("renders every Changelog issue", async () => {
    for (const issue of ISSUES) {
      const text = await render(changelogIssue, `/changelog/${issue.version}`, {
        version: issue.version,
      });
      expect(text).toContain(issue.tagline);
      expect(text).toContain("## upcoming");
    }
  });

  it("misses an unknown version", async () => {
    if (changelogIssue.kind !== "terminal") throw new Error();
    const result = await changelogIssue.render({
      params: { version: "0.0.0" },
      search: new URLSearchParams(),
      path: "/changelog/0.0.0",
    });
    expect(result.kind).toBe("notFound");
  });

  it("renders the archive newest first", async () => {
    const text = await render(changelogArchive, "/changelog");
    const versions = [...text.matchAll(/v(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
    expect(versions[0]).toBe(ISSUES.at(-1)!.version);
  });

  it("resolves directions links the way the page does", async () => {
    expect(await render(directions, "/events/directions")).toContain("124");
    expect(
      await render(directions, "/events/directions", {}, "b=Boyd"),
    ).toContain("Boyd Research Center");
    expect(
      await render(directions, "/events/directions", {}, "b=Nowhere"),
    ).toContain("Dining, Learning");
  });

  it("renders help", async () => {
    expect(await render(help, "/help")).toContain("curl devdogsuga.org/events");
  });
});
