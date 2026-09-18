/**
 * One-shot IMAP APPEND: place a finished MIME message in a mailbox's Drafts
 * folder, where every Outlook — new, web, Mac, classic — offers it as an
 * editable draft. This is the whole reason for speaking IMAP at all: the
 * mailbox is the one place all the clients agree on, and APPEND is the one
 * verb this workflow needs, so a dependency-free sliver of the protocol beats
 * a client library that models the rest of it.
 */
import { connect } from "node:tls";

const DEFAULT_HOST = "outlook.office365.com";
const TIMEOUT_MS = 30_000;

/** RFC 7628's SASL initial response: user and bearer token, ^A-delimited. */
export function xoauth2(user: string, accessToken: string): string {
  return Buffer.from(
    `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`,
    "utf8",
  ).toString("base64");
}

/**
 * The Drafts folder's real name out of `LIST` output, for mailboxes whose
 * folders are not in English. The `\Drafts` attribute is the label Exchange
 * puts on the folder regardless of what it is called.
 */
export function draftsFromList(lines: readonly string[]): string | null {
  for (const line of lines) {
    const match = /^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (.+)$/.exec(line);
    if (!match || !/\\Drafts\b/i.test(match[1]!)) continue;
    const raw = match[2]!.trim();
    return raw.startsWith('"') && raw.endsWith('"')
      ? raw.slice(1, -1).replace(/\\(["\\])/g, "$1")
      : raw;
  }
  return null;
}

/** Folder names go back out quoted, so quote-significant bytes get escaped. */
export function quoteMailbox(name: string): string {
  return `"${name.replace(/([\\"])/g, "\\$1")}"`;
}

interface TaggedReply {
  /** `OK`, `NO`, or `BAD`, upper-cased. */
  status: string;
  /** The rest of the tagged line, for error messages. */
  text: string;
  /** Untagged `* …` lines that arrived before the tag. */
  untagged: string[];
}

export async function appendDraft(options: {
  user: string;
  accessToken: string;
  /** The full MIME message, CRLF line endings. */
  message: string;
  host?: string;
}): Promise<void> {
  const host = options.host ?? DEFAULT_HOST;
  const socket = connect({ host, port: 993, servername: host });
  socket.setTimeout(TIMEOUT_MS);

  let buffer = "";
  let sequence = 0;
  const pending: string[] = [];
  let wake: (() => void) | null = null;
  let failure: Error | null = null;

  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let index;
    while ((index = buffer.indexOf("\r\n")) !== -1) {
      pending.push(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
    }
    wake?.();
  });
  const fail = (err: Error) => {
    failure ??= err;
    socket.destroy();
    wake?.();
  };
  socket.on("error", (err: Error) => fail(err));
  socket.on("timeout", () => fail(new Error(`${host} stopped answering.`)));
  socket.on("close", () => fail(new Error(`${host} closed the connection.`)));

  const nextLine = async (): Promise<string> => {
    for (;;) {
      if (pending.length) return pending.shift()!;
      if (failure) throw failure;
      await new Promise<void>((resolvePromise) => {
        wake = resolvePromise;
      });
      wake = null;
    }
  };

  /**
   * Sends one command and reads to its tagged reply. A `+ ` continuation
   * hands control back via `onContinue` — APPEND pushes the literal there,
   * and a failed AUTHENTICATE wants a bare CRLF to surface its tagged NO.
   */
  const command = async (
    line: string,
    onContinue?: () => void,
  ): Promise<TaggedReply> => {
    const tag = `T${++sequence}`;
    socket.write(`${tag} ${line}\r\n`);
    const untagged: string[] = [];
    for (;;) {
      const reply = await nextLine();
      if (reply.startsWith("+ ") || reply === "+") {
        (onContinue ?? (() => socket.write("\r\n")))();
        continue;
      }
      if (reply.startsWith(`${tag} `)) {
        const [status = "", ...rest] = reply.slice(tag.length + 1).split(" ");
        return { status: status.toUpperCase(), text: rest.join(" "), untagged };
      }
      if (reply.startsWith("* ")) untagged.push(reply);
    }
  };

  try {
    await nextLine(); // The server greets first; nothing in it matters here.

    const auth = await command(
      `AUTHENTICATE XOAUTH2 ${xoauth2(options.user, options.accessToken)}`,
    );
    if (auth.status !== "OK") {
      throw new Error(
        `${options.user} was refused: ${auth.text || auth.status}. ` +
          "Sign in again if the stored grant has been revoked.",
      );
    }

    const literal = Buffer.from(options.message, "utf8");
    const append = (folder: string) =>
      command(
        `APPEND ${quoteMailbox(folder)} (\\Draft \\Seen) {${literal.length}}`,
        () => {
          socket.write(literal);
          socket.write("\r\n");
        },
      );

    let placed = await append("Drafts");
    if (placed.status !== "OK") {
      // Exchange names the folder in the mailbox's own language; the
      // attribute in LIST is the stable way to find it.
      const list = await command('LIST "" "*"');
      const drafts = draftsFromList(list.untagged);
      if (drafts && drafts !== "Drafts") placed = await append(drafts);
      if (placed.status !== "OK") {
        throw new Error(`APPEND was refused: ${placed.text || placed.status}`);
      }
    }

    await command("LOGOUT");
  } finally {
    socket.destroy();
  }
}
