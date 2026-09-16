/**
 * One-shot SMTP submission: send a finished MIME message byte-for-byte.
 *
 * This exists because a draft cannot survive being sent from Outlook. The
 * web Outlook composer is a rich-text editor with a style whitelist, and
 * sending a pushed draft re-serializes whatever that editor kept: forensics
 * on a received copy showed the head `<style>` replaced with Outlook's own,
 * every `background-image` and `bgcolor` gone, and most class attributes
 * dropped — all of the newsletter's dark-mode defenses, stripped in transit.
 * (Classic Outlook mangles differently, into Word HTML, but just as surely.)
 * Submitting over SMTP bypasses every composer: recipients get the authored
 * document, stylesheet and all. Like `imap.ts`, this speaks just the sliver
 * of the protocol the workflow needs — EHLO, STARTTLS, AUTH, one message.
 */
import { createConnection } from "node:net";
import { connect as connectTls } from "node:tls";
import type { Socket } from "node:net";
import { xoauth2 } from "./imap.js";

const DEFAULT_HOST = "smtp.office365.com";
const TIMEOUT_MS = 30_000;

/**
 * RFC 5322 origination headers for a message built as a draft. `buildEml`
 * deliberately emits none of these — draft-ness is their absence — so the
 * send path prepends them. The submission server stamps `Message-ID`.
 */
export function originationHeaders(
  from: string,
  to: readonly string[],
  date = new Date(),
): string {
  return [
    `From: <${from}>`,
    `To: ${to.map((address) => `<${address}>`).join(", ")}`,
    // toUTCString is RFC 5322's fixed-length date form, save the zone name.
    `Date: ${date.toUTCString().replace(/GMT$/, "+0000")}`,
    "",
  ].join("\r\n");
}

/** RFC 5321 §4.5.2 transparency: a line-leading `.` doubles inside DATA. */
export function dotStuff(message: string): string {
  return message.replace(/(^|\r\n)\./g, "$1..");
}

/**
 * `true` when an SMTP reply line ends its reply: `250 done` rather than the
 * `250-more coming` continuation form (RFC 5321 §4.2.1).
 */
export function endsReply(line: string): boolean {
  return /^\d{3}(?: |$)/.test(line);
}

export async function submitMessage(options: {
  user: string;
  accessToken: string;
  /** The envelope sender — must be the authenticated mailbox on Exchange. */
  from: string;
  recipients: readonly string[];
  /** The full MIME message, origination headers included, CRLF endings. */
  message: string;
  host?: string;
}): Promise<void> {
  const host = options.host ?? DEFAULT_HOST;
  if (!options.recipients.length) throw new Error("No recipients.");

  let buffer = "";
  const pending: string[] = [];
  let wake: (() => void) | null = null;
  let failure: Error | null = null;

  const fail = (err: Error) => {
    failure ??= err;
    socket.destroy();
    wake?.();
  };
  /** (Re)binds the line reader — once to the TCP socket, again after TLS. */
  const adopt = (next: Socket) => {
    next.setTimeout(TIMEOUT_MS);
    next.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\r\n")) !== -1) {
        pending.push(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
      }
      wake?.();
    });
    next.on("error", (err: Error) => fail(err));
    next.on("timeout", () => fail(new Error(`${host} stopped answering.`)));
    next.on("close", () => fail(new Error(`${host} closed the connection.`)));
    return next;
  };

  let socket = adopt(createConnection({ host, port: 587 }));

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

  /** Reads one full reply; throws unless its code is in `expect`. */
  const reply = async (expect: readonly number[], doing: string) => {
    let line: string;
    do {
      line = await nextLine();
    } while (!endsReply(line));
    const code = Number(line.slice(0, 3));
    if (!expect.includes(code)) {
      throw new Error(`${doing}: ${line}`);
    }
    return line;
  };
  const command = (line: string, expect: readonly number[], doing: string) => {
    socket.write(`${line}\r\n`);
    return reply(expect, doing);
  };

  try {
    await reply([220], `${host} refused the connection`);
    await command(`EHLO [127.0.0.1]`, [250], "EHLO was refused");
    await command("STARTTLS", [220], "STARTTLS was refused");

    // The server speaks next only after the handshake, so nothing is in
    // flight — but the plaintext socket's reader has to come off before the
    // wrap, or it would keep pushing what is now ciphertext into the line
    // buffer (and its close fires only when the whole connection does).
    for (const event of ["data", "timeout", "close"] as const) {
      socket.removeAllListeners(event);
    }
    socket.setTimeout(0);
    socket = adopt(connectTls({ socket, servername: host }));
    await command(`EHLO [127.0.0.1]`, [250], "EHLO after STARTTLS was refused");

    await command(
      `AUTH XOAUTH2 ${xoauth2(options.user, options.accessToken)}`,
      [235],
      `${options.user} was refused. Sign in again if the stored grant lacks ` +
        "SMTP.Send — grants from before --send existed only asked for IMAP",
    );

    await command(
      `MAIL FROM:<${options.from}>`,
      [250],
      `The sender ${options.from} was refused`,
    );
    for (const recipient of options.recipients) {
      await command(
        `RCPT TO:<${recipient}>`,
        [250, 251],
        `The recipient ${recipient} was refused`,
      );
    }

    await command("DATA", [354], "DATA was refused");
    const body = dotStuff(options.message);
    socket.write(body.endsWith("\r\n") ? body : `${body}\r\n`);
    await command(".", [250], "The message was refused");

    socket.write("QUIT\r\n");
  } finally {
    socket.destroy();
  }
}
