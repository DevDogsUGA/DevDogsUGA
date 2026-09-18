/** `pnpm devtools emails [template…] [--format html,text] [--out dir]`. */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { isTTY, log, multiselect, note, text as askText } from "@clack/prompts";
import { positionals } from "../args.js";
import { errorMessage, explain, unwrap } from "../ui.js";
import { EMAIL_FIXTURES } from "./fixtures.js";

export type EmailFormat = "html" | "text";
export const EMAIL_FORMATS = ["html", "text"] as const;
export type EmailName = keyof typeof EMAIL_FIXTURES;
export const EMAIL_NAMES = Object.keys(EMAIL_FIXTURES) as EmailName[];

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

export interface EmailOptions {
  names: EmailName[];
  formats: EmailFormat[];
  out: string;
  noOutput: boolean;
}

function expandHome(value: string): string {
  return value === "~" || value.startsWith("~/")
    ? resolve(homedir(), value.slice(2))
    : value;
}

export function parseEmailArgs(
  argv: readonly string[],
  cwd: string,
): EmailOptions | Error {
  const requested = positionals(argv);
  const unknown = requested.filter(
    (name) => name !== "*" && !EMAIL_NAMES.includes(name as EmailName),
  );
  if (unknown.length) {
    return new Error(
      `No email template called ${unknown.join(", ")}. Try ${EMAIL_NAMES.join(", ")}, or *.`,
    );
  }

  const rawFormats = (flagValue(argv, "--format") ?? "html")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const badFormats = rawFormats.filter(
    (value) => !EMAIL_FORMATS.includes(value as EmailFormat),
  );
  if (badFormats.length)
    return new Error(
      `Unknown format ${badFormats.join(", ")}. Try html or text.`,
    );

  const names = requested.includes("*")
    ? [...EMAIL_NAMES]
    : (requested as EmailName[]);
  return {
    names,
    formats: [...new Set(rawFormats)] as EmailFormat[],
    out: resolve(cwd, expandHome(flagValue(argv, "--out") ?? "email-previews")),
    noOutput: argv.includes("--dry-run") || argv.includes("--no-output"),
  };
}

async function interactive(options: EmailOptions): Promise<EmailOptions> {
  if (options.names.length) return options;
  if (!isTTY(process.stdout)) {
    throw new Error(
      "No terminal to choose templates. Name one, or pass * for all.",
    );
  }
  const names = unwrap(
    await multiselect({
      message: "Which emails?",
      options: EMAIL_NAMES.map((name) => ({ value: name, label: name })),
      initialValues: [...EMAIL_NAMES],
      required: true,
    }),
  ) as EmailName[];
  const formats = unwrap(
    await multiselect({
      message: "Which formats?",
      options: [
        { value: "html", label: "HTML", hint: "open in a browser" },
        { value: "text", label: "Plain text", hint: "the email alternative" },
      ],
      initialValues: ["html"],
      required: true,
    }),
  ) as EmailFormat[];
  const entered = unwrap(
    await askText({
      message: "Where should these go?",
      placeholder: "./email-previews",
      defaultValue: "./email-previews",
    }),
  ).trim();
  return {
    ...options,
    names,
    formats,
    out: resolve(process.cwd(), expandHome(entered || "email-previews")),
  };
}

export function destination(
  out: string,
  name: EmailName,
  format: EmailFormat,
): string {
  return resolve(out, `${name}.${format === "text" ? "txt" : "html"}`);
}

export async function generateEmails(options: EmailOptions): Promise<string[]> {
  // Dynamic so every unrelated devtools command can still run before the
  // generated email package has been built on a fresh checkout.
  const { render } = await import("@devdogsuga/email");
  const written: string[] = [];
  for (const name of options.names) {
    const email = render(name, EMAIL_FIXTURES[name]);
    for (const format of options.formats) {
      const file = destination(options.out, name, format);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, format === "html" ? email.html : email.text);
      written.push(file);
    }
  }
  return written;
}

export async function runEmails(argv: string[]): Promise<void> {
  const parsed = parseEmailArgs(argv, process.cwd());
  if (parsed instanceof Error) {
    explain("Could not read that.", parsed.message, [
      "pnpm devtools emails",
      "pnpm devtools emails '*' --format html,text --out ~/emails",
    ]);
    process.exitCode = 1;
    return;
  }

  try {
    const options = await interactive(parsed);
    if (options.noOutput) {
      const { render } = await import("@devdogsuga/email");
      note(
        options.names
          .map(
            (name) =>
              `${name}\n  ${render(name, EMAIL_FIXTURES[name]).subject}\n  ${options.formats.map((f) => destination(options.out, name, f)).join("\n  ")}`,
          )
          .join("\n"),
        `${options.names.length} email template${options.names.length === 1 ? "" : "s"}`,
      );
      return;
    }
    const written = await generateEmails(options);
    for (const file of written) log.success(file);
    log.info(
      `${written.length} preview file${written.length === 1 ? "" : "s"} written.`,
    );
  } catch (err) {
    explain("Could not render those emails.", errorMessage(err), [
      "Build the email package with `pnpm --filter @devdogsuga/email build`.",
      "Then try `pnpm devtools emails '*' --out ~/emails`.",
    ]);
    process.exitCode = 1;
  }
}
