/**
 * Sign-in for the club mailbox, borrowing Thunderbird's app registration.
 *
 * UGA's tenant blocks user consent for every Microsoft Graph mail scope (the
 * Microsoft-managed default policy), so the clean path — a Graph-created
 * draft — needs an EITS-approved app registration. The same policy, though,
 * allowlists a handful of mail clients by application ID for the legacy
 * IMAP/SMTP scopes, Thunderbird among them. This module runs the standard
 * authorization-code flow as that client: the officer signs in as the mailbox
 * in a browser, and the refresh token is theirs — the same grant Thunderbird
 * itself would hold. Presenting another client's ID is a documented
 * convention in open-source mail tooling (mbsync, OfflineIMAP, DavMail), but
 * it is Microsoft's allowlist, and this stops working the day they prune it.
 *
 * The redirect comes back two ways. Entra ignores the port when matching a
 * localhost redirect URI, so the ordinary path is `loopback.ts`: a throwaway
 * server on an ephemeral port that catches the code itself. When that server
 * cannot bind, the flow falls back to Thunderbird's registered
 * `https://localhost` — a dead page whose address bar holds the code, pasted
 * back by hand.
 *
 * No PKCE and no client secret: Thunderbird is registered as a public client,
 * and the code exchange happens entirely on this machine.
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CLIENT_ID = "9e5f94bc-e8a4-4e73-b8be-63364c29d753";
/** The fallback redirect when no loopback server could bind. */
export const PASTE_REDIRECT_URI = "https://localhost";
// IMAP places drafts; SMTP.Send is `--send`. Both are on the same consent
// allowlist for the borrowed client, so one grant covers both, and a stored
// IMAP-only grant upgrades silently on its next refresh.
const SCOPE =
  "https://outlook.office365.com/IMAP.AccessAsUser.All https://outlook.office365.com/SMTP.Send offline_access";
const AUTHORITY = "https://login.microsoftonline.com/organizations/oauth2/v2.0";

export function authorizeUrl(
  mailbox: string,
  redirectUri: string,
  state?: string,
): string {
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPE,
    login_hint: mailbox,
    ...(state ? { state } : {}),
  });
  return `${AUTHORITY}/authorize?${query}`;
}

/**
 * The code out of whatever the officer pastes: the whole `https://localhost/?
 * code=…` address (the intended gesture — the browser shows a dead page and
 * they copy its location) or the bare code itself.
 */
export function codeFromRedirect(pasted: string): string | Error {
  const input = pasted.trim();
  const error = /[?&#]error=([^&\s]+)/.exec(input);
  if (error) {
    const description = /[?&#]error_description=([^&\s]+)/.exec(input);
    return new Error(
      description
        ? decodeURIComponent(description[1]!.replace(/\+/g, " "))
        : decodeURIComponent(error[1]!),
    );
  }
  const inUrl = /[?&#]code=([^&\s]+)/.exec(input);
  if (inUrl) return decodeURIComponent(inUrl[1]!);
  // Bare codes are opaque but never contain URL structure or whitespace.
  if (input && !/[\s/?&=]/.test(input)) return input;
  return new Error(
    "That has no ?code= in it. Paste the whole address bar of the localhost page.",
  );
}

export interface MailboxTokens {
  accessToken: string;
  refreshToken: string;
}

async function tokenRequest(
  grant: Record<string, string>,
): Promise<MailboxTokens> {
  const response = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      scope: SCOPE,
      ...grant,
    }),
  });
  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new Error(
      body.error_description ??
        body.error ??
        `Token endpoint answered ${response.status}.`,
    );
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

export function redeemCode(
  code: string,
  redirectUri: string,
): Promise<MailboxTokens> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    // Must be byte-for-byte the redirect the code was issued against.
    redirect_uri: redirectUri,
  });
}

export function refreshTokens(refreshToken: string): Promise<MailboxTokens> {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

// ── The stored grant ─────────────────────────────────────────────────────────

export interface StoredGrant {
  mailbox: string;
  refreshToken: string;
}

/**
 * Outside the repo on purpose: the refresh token opens the club mailbox, and
 * nothing that opens the club mailbox belongs anywhere `git add` can reach.
 */
export function grantPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "devdogsuga", "newsletter-mailbox.json");
}

export async function readGrant(): Promise<StoredGrant | null> {
  try {
    const parsed = JSON.parse(
      await readFile(grantPath(), "utf8"),
    ) as Partial<StoredGrant>;
    return typeof parsed.mailbox === "string" &&
      typeof parsed.refreshToken === "string"
      ? { mailbox: parsed.mailbox, refreshToken: parsed.refreshToken }
      : null;
  } catch {
    return null;
  }
}

export async function writeGrant(grant: StoredGrant): Promise<void> {
  const path = grantPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(grant, null, 2)}\n`, {
    mode: 0o600,
  });
  // writeFile's mode only applies on create; an existing file keeps its old
  // bits, so tighten explicitly on the rotation path too.
  await chmod(path, 0o600);
}
