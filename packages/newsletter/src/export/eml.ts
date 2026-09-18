/**
 * A minimal MIME builder for Outlook-importable drafts.
 *
 * The platform's send path never sees this — the Cloudflare `send_email`
 * binding takes `{subject, html, text}` and builds its own MIME. This exists
 * for the newsletter workflow: an officer reviews the draft in Outlook, and
 * devtools' `--send` submits this same MIME over SMTP. (Never send a draft
 * from Outlook itself — its composers rewrite the HTML on the way out.)
 *
 * The shape is what that workflow demands:
 *   - `X-Unsent: 1` and no `Message-ID`, so Outlook opens a compose window
 *     rather than a received message. `unsent: false` drops the header for
 *     the other route to the same compose window: devtools' `--push` APPENDs
 *     this MIME into the mailbox's Drafts folder, where draft-ness comes from
 *     the folder and the flag, not a header.
 *   - `multipart/related`, HTML part first, every image an inline `cid:` PNG
 *     part — the one image form Gmail and both Outlooks all render.
 *   - CRLF line endings throughout and base64 wrapped at 76 columns
 *     (RFC 2045); parsers are unforgiving about both.
 */

export interface EmlImage {
  /** The bare Content-ID — the HTML references it as `cid:<this>`. */
  cid: string;
  filename: string;
  /** e.g. `image/png`. */
  contentType: string;
  /** The image bytes, already base64. */
  base64: string;
}

export interface EmlInput {
  subject: string;
  html: string;
  images: EmlImage[];
  /** Overridable only so tests can assert against a known value. */
  boundary?: string;
  /** `false` for messages placed in a Drafts folder rather than opened as files. */
  unsent?: boolean;
}

/** RFC 2045 body wrapping: base64 lines at most 76 columns. */
function wrap76(base64: string): string {
  return base64.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

/**
 * RFC 2047 for the one header that carries prose. ASCII passes through
 * untouched so the file stays greppable in the common case.
 */
function encodeSubject(subject: string): string {
  if (!/[^\t\x20-\x7e]/.test(subject)) return subject;
  return `=?utf-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

export function buildEml({
  subject,
  html,
  images,
  boundary = "=_devdogs-changelog",
  unsent = true,
}: EmlInput): string {
  const lines: string[] = [
    ...(unsent ? ["X-Unsent: 1"] : []),
    "MIME-Version: 1.0",
    `Subject: ${encodeSubject(subject)}`,
    `Content-Type: multipart/related; type="text/html"; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(html, "utf8").toString("base64")),
  ];
  for (const image of images) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${image.contentType}; name="${image.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${image.cid}>`,
      `Content-Disposition: inline; filename="${image.filename}"`,
      "",
      wrap76(image.base64),
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}
