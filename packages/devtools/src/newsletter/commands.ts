/**
 * `pnpm devtools newsletter [version…] [--format eml,html] [--out dir]
 * [--push] [--send --to addresses] [--mailbox address]`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  isTTY,
  log,
  multiselect,
  spinner,
  text as askText,
} from "@clack/prompts";
import { Resvg } from "@resvg/resvg-js";
import { positionals } from "../args.js";
import { errorMessage, explain, unwrap } from "../ui.js";
import { appendDraft } from "./imap.js";
import { originationHeaders, submitMessage } from "./smtp.js";
import { openInBrowser, startLoopback, type Loopback } from "./loopback.js";
import {
  authorizeUrl,
  codeFromRedirect,
  grantPath,
  PASTE_REDIRECT_URI,
  readGrant,
  redeemCode,
  refreshTokens,
  writeGrant,
  type MailboxTokens,
} from "./oauth.js";

/** The account the newsletter goes out from; `--mailbox` overrides. */
const CLUB_MAILBOX = "devdogs@uga.edu";

export type NewsletterFormat = "eml" | "html";
export const NEWSLETTER_FORMATS = ["eml", "html"] as const;

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

export interface NewsletterOptions {
  versions: string[];
  formats: NewsletterFormat[];
  out: string;
  /** Append each issue as a draft in the club mailbox. */
  push: boolean;
  /** Send each issue over SMTP, to `to`, byte-for-byte as authored. */
  send: boolean;
  to: string[];
  mailbox: string;
}

function expandHome(value: string): string {
  return value === "~" || value.startsWith("~/")
    ? resolve(homedir(), value.slice(2))
    : value;
}

export function parseNewsletterArgs(
  argv: readonly string[],
  cwd: string,
): NewsletterOptions | Error {
  const push = argv.includes("--push");
  const send = argv.includes("--send");
  const to = (flagValue(argv, "--to") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  // A send is deliberate twice over: the flag names the act and --to names
  // who receives it. Neither is inferred and neither is prompted for.
  if (send && !to.length) {
    return new Error("--send needs --to, a comma-separated recipient list.");
  }
  if (to.length && !send) {
    return new Error("--to only means something with --send.");
  }
  // Both formats by default: the .eml is the point of the command, and the
  // .html is how it gets proofread before an officer opens Outlook. Except
  // under --push or --send, where a caller who wanted files too would have
  // said so — the draft in the mailbox, or the send, IS the output.
  const rawFormats = (
    flagValue(argv, "--format") ?? (push || send ? "" : "eml,html")
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const badFormats = rawFormats.filter(
    (value) => !NEWSLETTER_FORMATS.includes(value as NewsletterFormat),
  );
  if (badFormats.length)
    return new Error(
      `Unknown format ${badFormats.join(", ")}. Try eml or html.`,
    );

  return {
    // Versions can only be validated against the built package, which loads
    // lazily inside the run — so they pass through here unchecked.
    versions: positionals(argv),
    formats: [...new Set(rawFormats)] as NewsletterFormat[],
    out: resolve(
      cwd,
      expandHome(flagValue(argv, "--out") ?? "changelog-exports"),
    ),
    push,
    send,
    to,
    mailbox: flagValue(argv, "--mailbox") ?? CLUB_MAILBOX,
  };
}

export function destination(
  out: string,
  version: string,
  format: NewsletterFormat,
): string {
  return resolve(out, `changelog-v${version}.${format}`);
}

async function interactive(
  options: NewsletterOptions,
  all: readonly { version: string; tagline: string }[],
): Promise<NewsletterOptions> {
  if (options.versions.length) return options;
  if (!isTTY(process.stdout)) {
    throw new Error(
      "No terminal to choose issues. Name one, or pass * for all.",
    );
  }
  const versions = unwrap(
    await multiselect({
      message: "Which issues?",
      options: all.map((issue) => ({
        value: issue.version,
        label: `v${issue.version}`,
        hint: issue.tagline,
      })),
      initialValues: [all[all.length - 1]?.version ?? ""].filter(Boolean),
      required: true,
    }),
  );
  const outputs = unwrap(
    await multiselect({
      message: "Which outputs?",
      options: [
        {
          value: "push",
          label: "Draft in the club mailbox",
          hint: `lands in Drafts of ${options.mailbox}; review in any Outlook`,
        },
        {
          value: "eml",
          label: "Outlook draft (.eml)",
          hint: "classic Outlook opens it for review",
        },
        { value: "html", label: "HTML preview", hint: "open in a browser" },
      ],
      initialValues: [...NEWSLETTER_FORMATS],
      required: true,
    }),
  ) as (NewsletterFormat | "push")[];
  const formats = outputs.filter(
    (output): output is NewsletterFormat => output !== "push",
  );
  let out = options.out;
  if (formats.length) {
    const entered = unwrap(
      await askText({
        message: "Where should the files go?",
        placeholder: "./changelog-exports",
        defaultValue: "./changelog-exports",
      }),
    ).trim();
    out = resolve(process.cwd(), expandHome(entered || "changelog-exports"));
  }
  return {
    ...options,
    versions,
    formats,
    out,
    push: options.push || outputs.includes("push"),
  };
}

/**
 * The browser sign-in, redirect caught by a loopback server: open the URL,
 * wait for the code to knock, exchange it. Five minutes is the patience —
 * authorization codes do not live much longer anyway.
 */
async function signInViaLoopback(
  mailbox: string,
  server: Loopback,
  state: string,
): Promise<MailboxTokens> {
  const redirectUri = `http://localhost:${server.port}/`;
  const url = authorizeUrl(mailbox, redirectUri, state);
  log.step(`Sign in as ${mailbox} in the browser window that just opened:`);
  log.message(url);
  openInBrowser(url);
  const wait = spinner();
  wait.start("Waiting for the sign-in to come back");
  try {
    const timeout = new Promise<never>((_, rejectLate) => {
      setTimeout(
        () =>
          rejectLate(
            new Error("Five minutes passed with no sign-in. Run it again."),
          ),
        5 * 60_000,
      ).unref();
    });
    const code = await Promise.race([server.code, timeout]);
    wait.stop("The sign-in came back.");
    return await redeemCode(code, redirectUri);
  } catch (err) {
    wait.stop("No sign-in.");
    throw err;
  } finally {
    server.close();
  }
}

/** The pasted fallback for a machine where no local port would bind. */
async function signInViaPaste(mailbox: string): Promise<MailboxTokens> {
  log.step(`Open this and sign in as ${mailbox}:`);
  log.message(authorizeUrl(mailbox, PASTE_REDIRECT_URI));
  const pasted = unwrap(
    await askText({
      message:
        "The browser will land on a dead localhost page. Paste its full address:",
      validate: (value) => {
        const code = codeFromRedirect(value ?? "");
        return code instanceof Error ? code.message : undefined;
      },
    }),
  );
  const code = codeFromRedirect(pasted);
  if (code instanceof Error) throw code;
  return redeemCode(code, PASTE_REDIRECT_URI);
}

/**
 * An access token for the club mailbox: the stored grant refreshed when there
 * is one, a browser sign-in when there is not.
 */
async function mailboxAccessToken(mailbox: string): Promise<string> {
  const stored = await readGrant();
  if (stored && stored.mailbox === mailbox) {
    try {
      const tokens = await refreshTokens(stored.refreshToken);
      // Microsoft rotates refresh tokens; keeping the old one means the next
      // run signs in from scratch.
      await writeGrant({ mailbox, refreshToken: tokens.refreshToken });
      return tokens.accessToken;
    } catch (err) {
      log.warn(`The stored sign-in was refused (${errorMessage(err)}).`);
    }
  }
  if (!isTTY(process.stdout)) {
    throw new Error(
      `No terminal to sign in as ${mailbox}. Run \`pnpm devtools newsletter --push\` interactively once; after that this works anywhere.`,
    );
  }
  const state = randomBytes(16).toString("hex");
  const server = await startLoopback(state).catch(() => null);
  const tokens = server
    ? await signInViaLoopback(mailbox, server, state)
    : await signInViaPaste(mailbox);
  await writeGrant({ mailbox, refreshToken: tokens.refreshToken });
  log.info(
    `Signed in. The grant lives in ${grantPath()} — mode 600, keep it that way.`,
  );
  return tokens.accessToken;
}

export async function runNewsletter(argv: string[]): Promise<void> {
  const parsed = parseNewsletterArgs(argv, process.cwd());
  if (parsed instanceof Error) {
    explain("Could not read that.", parsed.message, [
      "pnpm devtools newsletter",
      "pnpm devtools newsletter '*' --format eml,html --out ~/changelog",
    ]);
    process.exitCode = 1;
    return;
  }

  try {
    // Dynamic so every unrelated devtools command can still run before the
    // newsletter package has been built on a fresh checkout.
    const { ISSUES, issueByVersion } = await import("@devdogsuga/newsletter");
    const { buildEml, emailImages, previewRenderContext, renderIssueDocument } =
      await import("@devdogsuga/newsletter/export");

    const unknown = parsed.versions.filter(
      (version) => version !== "*" && !issueByVersion(version),
    );
    if (unknown.length) {
      explain(
        "Could not read that.",
        `No issue called ${unknown.join(", ")}. Try ${ISSUES.map((issue) => issue.version).join(", ")}, or *.`,
        ["pnpm devtools newsletter", "pnpm devtools newsletter '*'"],
      );
      process.exitCode = 1;
      return;
    }

    const options = await interactive(parsed, ISSUES);
    const versions = options.versions.includes("*")
      ? ISSUES.map((issue) => issue.version)
      : [...new Set(options.versions)];

    // Rasterised once: the marks are the same in every issue. 2x the display
    // size the components declare, so the email stays sharp on dense screens.
    const images =
      options.formats.includes("eml") || options.push || options.send
        ? emailImages().map((image) => ({
            cid: image.cid,
            filename: image.filename,
            contentType: "image/png",
            base64: Buffer.from(
              new Resvg(image.svg, {
                fitTo: { mode: "width", value: image.rasterWidth },
                // The marks are pure paths; nothing here needs a host font.
                font: { loadSystemFonts: false },
              })
                .render()
                .asPng(),
            ).toString("base64"),
          }))
        : [];

    const written: string[] = [];
    for (const version of versions) {
      const issue = issueByVersion(version)!;
      for (const format of options.formats) {
        const file = destination(options.out, version, format);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(
          file,
          format === "eml"
            ? buildEml({
                subject: issue.title,
                html: renderIssueDocument(issue),
                images,
              })
            : renderIssueDocument(issue, previewRenderContext()),
        );
        written.push(file);
      }
    }
    for (const file of written) log.success(file);
    if (written.length) {
      log.info(
        `${written.length} file${written.length === 1 ? "" : "s"} written. An .eml opens in classic Outlook for review; send with --send.`,
      );
    }

    if (options.push || options.send) {
      const accessToken = await mailboxAccessToken(options.mailbox);
      if (options.push) {
        for (const version of versions) {
          const issue = issueByVersion(version)!;
          await appendDraft({
            user: options.mailbox,
            accessToken,
            message: buildEml({
              subject: issue.title,
              html: renderIssueDocument(issue),
              images,
              unsent: false,
            }),
          });
          log.success(`v${version} → Drafts of ${options.mailbox}`);
        }
        log.info(
          "Open any Outlook as the club account to review — but send with " +
            "`--send`, not from Outlook: its composers rewrite the HTML.",
        );
      }
      if (options.send) {
        for (const version of versions) {
          const issue = issueByVersion(version)!;
          await submitMessage({
            user: options.mailbox,
            accessToken,
            from: options.mailbox,
            recipients: options.to,
            message:
              originationHeaders(options.mailbox, options.to) +
              buildEml({
                subject: issue.title,
                html: renderIssueDocument(issue),
                images,
                unsent: false,
              }),
          });
          log.success(`v${version} → sent to ${options.to.join(", ")}`);
        }
      }
    }
  } catch (err) {
    explain("Could not export the changelog.", errorMessage(err), [
      "Build it with `pnpm --filter @devdogsuga/newsletter build`.",
      "Then try `pnpm devtools newsletter '*' --out ~/changelog`.",
    ]);
    process.exitCode = 1;
  }
}
