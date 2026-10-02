/**
 * `pnpm -F @devdogsuga/email preview [template…] [--format html,text] [--out dir]`
 *
 * Fills each compiled template with the fixture props below and writes
 * browser-ready files, by default every template as HTML into
 * `email-previews/` (gitignored) in the current directory.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { render, type Templates } from "../src/runtime/index.js";

/**
 * Credible, non-sensitive values. `satisfies` is the maintenance mechanism: a
 * new template or prop cannot ship without deciding what its preview says.
 */
const FIXTURES = {
  JoinRequest: {
    leadName: "Jordan",
    applicantName: "Avery",
    teamName: "Byte Bulldogs",
    reviewUrl: "https://devdogsuga.org/teams/requests",
  },
  TeamInvite: {
    inviteeName: "Avery",
    teamName: "Byte Bulldogs",
    leadName: "Jordan",
    acceptUrl: "https://devdogsuga.org/teams/requests",
  },
} satisfies Templates;

type Name = keyof typeof FIXTURES;
const NAMES = Object.keys(FIXTURES) as Name[];
const FORMATS = ["html", "text"] as const;

function fail(message: string): never {
  console.error(`preview: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const requested: string[] = [];
let formats: string[] = ["html"];
let out = "email-previews";
for (let i = 0; i < args.length; i++) {
  const arg = args[i] as string;
  if (arg === "--format") formats = (args[++i] ?? "").split(",");
  else if (arg === "--out") out = args[++i] ?? out;
  else if (arg.startsWith("--")) fail(`unknown flag ${arg}`);
  else requested.push(arg);
}

const unknown = requested.filter(
  (n) => n !== "*" && !NAMES.includes(n as Name),
);
if (unknown.length) {
  fail(
    `no template called ${unknown.join(", ")}. Try ${NAMES.join(", ")}, or *.`,
  );
}
const badFormats = formats.filter(
  (f) => !(FORMATS as readonly string[]).includes(f),
);
if (badFormats.length) {
  fail(`unknown format ${badFormats.join(", ")}. Try html or text.`);
}

const names: Name[] =
  requested.length === 0 || requested.includes("*")
    ? NAMES
    : (requested as Name[]);
const dir = resolve(
  out === "~" || out.startsWith("~/") ? resolve(homedir(), out.slice(2)) : out,
);
mkdirSync(dir, { recursive: true });

for (const name of names) {
  const email = render(name, FIXTURES[name]);
  for (const format of new Set(formats)) {
    const file = resolve(dir, `${name}.${format === "text" ? "txt" : "html"}`);
    writeFileSync(file, format === "html" ? email.html : email.text);
    console.log(file);
  }
}
