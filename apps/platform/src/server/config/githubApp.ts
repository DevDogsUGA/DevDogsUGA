/**
 * Authenticating as the config-PR GitHub App (`GH_CONFIG_APP_ID` and
 * `GH_CONFIG_APP_PRIVATE_KEY`; "DevDogs config PRs", Contents and Pull requests
 * write, installed on DevDogsUGA only).
 *
 * The handshake is the same one the read-only App's commit sync reuses
 * (`server/github/transport.ts`): sign a ten-minute RS256 JWT with the App's
 * key, find the installation, exchange the JWT for an installation token. The
 * platform runs in a Worker, so this signs with WebCrypto, which takes PKCS#8
 * only. GitHub issues PKCS#1 keys ("BEGIN RSA PRIVATE KEY"), so a PKCS#1 key is
 * wrapped into PKCS#8 first.
 *
 * `fetch` is injected: the tests never reach GitHub.
 */

export type Fetch = typeof fetch;

export class GithubApiError extends Error {
  override name = "GithubApiError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const API = "https://api.github.com";

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let n = length; n > 0; n = Math.floor(n / 256)) bytes.unshift(n % 256);
  return [0x80 | bytes.length, ...bytes];
}

function der(tag: number, body: Uint8Array | number[]): Uint8Array {
  const content = Array.from(body);
  return Uint8Array.from([tag, ...derLength(content.length), ...content]);
}

/** PKCS#1 `RSAPrivateKey` wrapped as a PKCS#8 `PrivateKeyInfo` (rsaEncryption). */
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = [0x02, 0x01, 0x00];
  const algorithm = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00,
  ];
  return der(0x30, [...version, ...algorithm, ...der(0x04, pkcs1)]);
}

/** The DER bytes of a PEM private key, as PKCS#8. Literal `\n` sequences are accepted. */
export function privateKeyDer(privateKey: string): Uint8Array {
  const pem = privateKey.includes("\\n")
    ? privateKey.replace(/\\n/g, "\n")
    : privateKey;
  const match = /-----BEGIN ((?:RSA )?PRIVATE KEY)-----([\s\S]+?)-----END/.exec(
    pem,
  );
  if (!match) throw new Error("The GitHub App private key is not a PEM key.");
  const binary = atob(match[2]!.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return match[1] === "RSA PRIVATE KEY" ? pkcs1ToPkcs8(bytes) : bytes;
}

/** An App JWT, valid for ten minutes at most (GitHub's cap), RS256. */
export async function appJwt(
  appId: string,
  privateKey: string,
  now = Date.now(),
): Promise<string> {
  const seconds = Math.floor(now / 1000);
  const unsigned = `${base64url(textBytes(JSON.stringify({ alg: "RS256", typ: "JWT" })))}.${base64url(
    textBytes(
      JSON.stringify({ iat: seconds - 60, exp: seconds + 9 * 60, iss: appId }),
    ),
  )}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyDer(privateKey) as BufferSource,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    textBytes(unsigned) as BufferSource,
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

export interface GithubCall {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  /** Ask for the file's raw text rather than JSON. */
  raw?: boolean;
}

/** One GitHub REST call. A non-2xx answer throws a `GithubApiError`. */
export async function githubCall<T>(
  doFetch: Fetch,
  token: string,
  path: string,
  { method = "GET", body, raw = false }: GithubCall = {},
): Promise<T> {
  const response = await doFetch(`${API}${path}`, {
    method,
    headers: {
      accept: raw
        ? "application/vnd.github.raw+json"
        : "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "devdogs-platform-config-prs",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    throw new GithubApiError(
      `GitHub answered ${response.status} for ${method} ${path.split("?")[0]}.`,
      response.status,
    );
  }
  return (raw ? await response.text() : await response.json()) as T;
}

export interface AppCredentials {
  appId: string;
  privateKey: string;
}

/**
 * An installation token for one repository, from the App's JWT. The token is
 * narrowed to that repository, so even an App installed more widely could not
 * write anywhere else through it.
 */
export async function installationToken(
  credentials: AppCredentials,
  repo: { owner: string; name: string },
  doFetch: Fetch = fetch,
  now = Date.now(),
): Promise<string> {
  const jwt = await appJwt(credentials.appId, credentials.privateKey, now);
  const installation = await githubCall<{ id: number }>(
    doFetch,
    jwt,
    `/repos/${repo.owner}/${repo.name}/installation`,
  );
  const { token } = await githubCall<{ token: string }>(
    doFetch,
    jwt,
    `/app/installations/${installation.id}/access_tokens`,
    { method: "POST", body: { repositories: [repo.name] } },
  );
  return token;
}
