#!/usr/bin/env node
// Builds the art preview page and, with --emit, a semester's JSON art.
//
//   node art-preview.mjs [outDir]        writes <outDir>/preview.html (default /tmp/d3)
//   node art-preview.mjs --emit <name>   prints {lines, regions} for <name>.txt
//
// The page renders every draft with BOTH empty-week treatments ("frost" and
// "omit") in the Cosmic colours, the same way the platform's SemesterArt does.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WEEKS = [
  "2026-09-07",
  "2026-09-14",
  "2026-09-21",
  "2026-09-28",
  "2026-10-05",
  "2026-10-12",
  "2026-10-19",
  "2026-10-26",
  "2026-11-02",
  "2026-11-09",
  "2026-11-16",
];
const SYMBOLS = "123456789ab";

function load(name) {
  const lines = readFileSync(join(here, `${name}.txt`), "utf8")
    .replace(/\n$/, "")
    .split("\n");
  const mask = readFileSync(join(here, `${name}.mask.txt`), "utf8")
    .replace(/\n$/, "")
    .split("\n");
  return { lines, mask };
}

/** Week (Monday) to runs of [line, column, length]. */
export function regionsFrom(lines, mask) {
  const regions = {};
  mask.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      const sym = row[c];
      const week = SYMBOLS.indexOf(sym);
      if (sym === " " || week < 0) {
        c += 1;
        continue;
      }
      let end = c;
      while (end < row.length && row[end] === sym) end += 1;
      const text = lines[r] ?? "";
      if ([...text.slice(c, end)].some((ch) => ch === " "))
        throw new Error(`${sym} marks a blank at line ${r}`);
      (regions[WEEKS[week]] ??= []).push([r, c, end - c]);
      c = end;
    }
  });
  return regions;
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(art, states, treatment) {
  const owner = new Map();
  for (const [week, spans] of Object.entries(art.regions)) {
    for (const [r, c, n] of spans)
      for (let i = c; i < c + n; i += 1) owner.set(`${r}:${i}`, week);
  }
  return art.lines
    .map((text, r) => {
      let html = "";
      for (let c = 0; c < text.length; c += 1) {
        const ch = text[c];
        const week = owner.get(`${r}:${c}`);
        if (ch === " ") {
          html += " ";
          continue;
        }
        if (!week) {
          html += `<i class="sc">${esc(ch)}</i>`;
          continue;
        }
        const state = states[week];
        if (state === "none") {
          html += treatment === "omit" ? " " : `<i class="fr">${esc(ch)}</i>`;
        } else {
          html += `<i class="${state}">${esc(ch)}</i>`;
        }
      }
      return html;
    })
    .join("\n");
}

function page() {
  const drafts = [
    [
      "a-paw-trail",
      "A. Paw trail",
      "lit-gold",
      "One paw print per week, walking up the night sky.",
    ],
    [
      "b-rocket",
      "B. Rocket",
      "lit-red",
      "The rocket is built a section a week, tail to nose; the flame lights first.",
    ],
    [
      "c-skyline",
      "C. Skyline",
      "lit-green",
      "A building per week; a lit week turns its windows on.",
    ],
  ];
  const midTerm = {};
  [
    "lit",
    "lit",
    "lit",
    "dark",
    "lit",
    "lit",
    "none",
    "lit",
    "none",
    "open",
    "open",
  ].forEach((s, i) => {
    midTerm[WEEKS[i]] = s;
  });
  const allLit = Object.fromEntries(WEEKS.map((w) => [w, "lit"]));
  const sections = drafts
    .map(([name, title, accent, blurb]) => {
      const { lines, mask } = load(name);
      const art = { lines, regions: regionsFrom(lines, mask) };
      const cell = (label, states, treatment) =>
        `<figure><pre aria-hidden="true" class="${accent}">${render(art, states, treatment)}</pre><figcaption>${label}</figcaption></figure>`;
      return `<section id="${name}"><h2>${title}</h2><p>${blurb}</p>
      <div class="row">
        ${cell("Frost: empty weeks 7 and 9 drawn in ice", midTerm, "frost")}
        ${cell("Left out: empty weeks 7 and 9 absent", midTerm, "omit")}
      </div>
      <div class="row">${cell("Finished term, every week lit", allLit, "frost")}</div></section>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Weekly art drafts, Fall 2026</title><style>
:root{--bg:#0a0718;--surface:#0f0b1e;--line:#2a2433;--line-strong:#4a4258;--text:#fff;--text-3:#a89ea9;--warn:#fcd34d;--note:#74d4ff;--red:#ffa1ad;--green:#34d399}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif;padding:24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 2px}p{color:var(--text-3);margin:0 0 12px}
.row{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;background:var(--surface);border:1px solid var(--line);padding:14px;max-width:100%}
figcaption{color:var(--text-3);font-size:12.5px;margin-top:8px}
pre{margin:0;font:13px/1.15 ui-monospace,Menlo,Consolas,monospace;overflow-x:auto;letter-spacing:0}
i{font-style:normal}.sc{color:var(--text-3);opacity:.45}.dark,.open{color:var(--line-strong)}.open{opacity:.8}
.fr{color:var(--note);opacity:.5}
.lit-gold .lit{color:var(--warn);text-shadow:0 0 6px rgba(252,211,77,.55)}
.lit-red .lit{color:var(--red);text-shadow:0 0 6px rgba(236,0,63,.6)}
.lit-green .lit{color:var(--green);text-shadow:0 0 6px rgba(52,211,153,.5)}
.legend{display:flex;gap:18px;flex-wrap:wrap;font:13px ui-monospace,monospace;color:var(--text-3)}
</style><body><h1>Weekly art drafts, Fall 2026</h1>
<p>Eleven weeks (Sep 7 to Nov 16). Weeks 7 and 9 are shown as no-meeting weeks in the first row; week 4 missed; weeks 10 and 11 not over.</p>
<div class="legend"><span style="color:var(--warn)">lit</span><span style="color:var(--line-strong)">dark / still open</span><span style="color:var(--note);opacity:.6">frost (no meeting)</span><span style="opacity:.5">scenery</span></div>
${sections}</body></html>`;
}

const args = process.argv.slice(2);
if (args[0] === "--emit") {
  const { lines, mask } = load(args[1]);
  process.stdout.write(
    `${JSON.stringify({ lines, regions: regionsFrom(lines, mask) }, null, 2)}\n`,
  );
} else {
  const out = args[0] ?? "/tmp/d3";
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "preview.html"), page());
  process.stdout.write(`wrote ${join(out, "preview.html")}\n`);
}
