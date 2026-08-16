/**
 * Mints `SANDBOX_PROXY_TOKEN` -- the sandbox Worker's credential for the two
 * platform functions it is allowed to call.
 *
 * The token is a JWT carrying `{"role": "sandbox_proxy"}`, signed with the
 * platform project's own signing key. **Minting is signing, not an API call:**
 * there is no `POST /v1/projects/{ref}/api-keys`, no management token, and no
 * dashboard step, which is what turns rotation from a three-step overlap dance
 * into something free enough to do on every deploy. Hence the 90-day `exp` --
 * a pipeline that goes stale then fails loudly instead of quietly holding a
 * credential forever.
 *
 * ## Interface (a deploy workflow captures this)
 *
 *   DEPLOY_ENV=production with-env -c 'node scripts/mint-sandbox-token.mjs'
 *
 * **stdout is the token and nothing else** -- no banner, no prose, one trailing
 * newline so `$(...)` yields exactly the token. Every diagnostic goes to
 * stderr, and any failure exits non-zero having written NOTHING to stdout: a
 * caller that pipes stdout into `wrangler secret put` must never receive a
 * half-formed or unsigned token, so validation happens before the first write.
 *
 * ## Why it runs inside `with-env -c`
 *
 * Same reason as `require-cloudflare-token.mjs`: the signing key lives in a
 * devops `.env.staging` / `.env.production`, never in the ambient environment.
 * `with-env` selects the file from `DEPLOY_ENV`, so "staging and production
 * have different signing keys" is already expressed by which file was loaded --
 * this script does not pick a key, it refuses to run unless the caller said
 * which environment it meant.
 *
 * ## No JWT library, on purpose
 *
 * HS256 is `HMAC-SHA256(base64url(header) + "." + base64url(payload))`, which
 * `node:crypto` does in one call. A dependency here would be a supply-chain
 * surface on the one script whose output is a production credential, in
 * exchange for four lines.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

/**
 * Hard-coded, and it must stay that way.
 *
 * Nothing in this script's interface can change the role: no flag, no
 * environment variable, no argument. The same signing key would happily
 * produce `{"role": "service_role"}` -- a token authorizing as the database
 * owner -- and the only thing standing between this script and that token is
 * that the string is a constant. A configurable role would make "which role
 * did production get?" a question about the caller's environment.
 */
export const SANDBOX_PROXY_ROLE = "sandbox_proxy";

/** 90 days, per the design doc. */
export const TOKEN_LIFETIME_SECONDS = 90 * 24 * 60 * 60;

/**
 * The floor `SUPABASE_JWT_SIGNING_KEY`'s schema also declares
 * (`apps/sandbox/env.ts`). Supabase's own legacy JWT secret is 40 characters;
 * anything materially shorter is not a key somebody imported but a value
 * somebody truncated, and HMAC-SHA256 under a short key is brute-forceable
 * offline by anyone holding one token.
 */
export const MIN_SIGNING_KEY_LENGTH = 32;

/** The environments a deployed Worker actually exists in. */
const DEPLOYED_ENVIRONMENTS = ["staging", "production"];

/** Refusals that are the operator's to fix, as opposed to a crash. */
export class MintError extends Error {
  constructor(message) {
    super(message);
    this.name = "MintError";
  }
}

const encode = (value) => Buffer.from(value, "utf8").toString("base64url");

/**
 * Signs the token.
 *
 * Pure and exported so the claims can be asserted without a real key. `now` is
 * a parameter rather than a `Date.now()` read for the same reason: an expiry
 * that cannot be tested is an expiry nobody finds out about until it passes.
 *
 * @param {object} options
 * @param {string} options.signingKey  The platform project's HS256 secret.
 * @param {string} [options.projectRef] Platform `PROJECT_REF`, when known.
 * @param {number} [options.now]        Epoch milliseconds.
 * @returns {string} A signed compact JWS.
 */
export function mintSandboxToken({ signingKey, projectRef, now = Date.now() }) {
  // Checked before anything is built, so there is no code path on which a
  // token exists in a variable while the key is unusable. `undefined` reaching
  // createHmac would throw, but `""` would NOT -- an empty HMAC key is legal,
  // and it would produce a perfectly well-formed token that anybody can forge.
  if (typeof signingKey !== "string" || signingKey.trim() === "") {
    throw new MintError(
      "SUPABASE_JWT_SIGNING_KEY is empty or unset. It is the platform " +
        "project's JWT secret and lives in the devops .env for the " +
        "environment being deployed -- `pnpm devtools secrets pull --env " +
        "<env>` fetches it. Refusing to mint: an empty HMAC key signs a " +
        "token anyone can forge.",
    );
  }
  if (signingKey.length < MIN_SIGNING_KEY_LENGTH) {
    throw new MintError(
      `SUPABASE_JWT_SIGNING_KEY is ${signingKey.length} characters; at least ` +
        `${MIN_SIGNING_KEY_LENGTH} are required. Supabase's own JWT secret is ` +
        "40, so a short value is a truncated paste rather than a real key.",
    );
  }

  const issuedAt = Math.floor(now / 1000);

  // `typ` and `alg` both matter. A verifier that honours `alg: "none"` accepts
  // an unsigned token, so the header is a literal here and never derived from
  // anything a caller controls.
  const header = { alg: "HS256", typ: "JWT" };

  /**
   * The claims PostgREST reads, in the shape Supabase's own keys use.
   *
   * `role` is the only one PostgREST requires -- it is what it passes to
   * `SET ROLE`, and `sandbox_proxy` is a real cluster role granted to
   * `authenticator` (migration 20260805000002). `exp` is enforced; `iat` is
   * not, and is here because "when was this minted" is the first question
   * asked when a deploy's token misbehaves.
   *
   * `iss` and `ref` mirror the shape of Supabase's own anon/service keys
   * rather than answering a known requirement -- PostgREST does not check
   * either unless configured to, but the hosted API gateway sits in front of
   * it and matching its own tokens costs nothing. `ref` is omitted rather than
   * guessed when PROJECT_REF is unset: a WRONG ref would be rejected, whereas
   * an absent one is at worst ignored.
   */
  const payload = {
    iss: "supabase",
    ...(projectRef ? { ref: projectRef } : {}),
    role: SANDBOX_PROXY_ROLE,
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS,
  };

  const signingInput = `${encode(JSON.stringify(header))}.${encode(
    JSON.stringify(payload),
  )}`;
  const signature = createHmac("sha256", signingKey)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

/**
 * Recomputes the signature and compares it in constant time.
 *
 * Exported because the one property this script cannot check by inspection is
 * that the thing it printed is actually signed with the key it was given, and
 * a caller that wants to assert that should not have to reimplement the
 * encoding it is verifying.
 *
 * @param {string} token
 * @param {string} signingKey
 * @returns {boolean}
 */
export function verifySandboxToken(token, signingKey) {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part === "")) return false;

  const expected = createHmac("sha256", signingKey)
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const actual = Buffer.from(parts[2], "base64url");
  // timingSafeEqual throws on a length mismatch rather than returning false.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * @returns {number} The process exit code.
 */
export function main(
  env = process.env,
  out = process.stdout,
  err = process.stderr,
) {
  // Refused rather than defaulted. `apps/sandbox`'s deploy scripts previously
  // shipped without DEPLOY_ENV and would have loaded `.env` -- the development
  // file -- so an unset value here is a real, already-observed failure, and
  // defaulting it would mint a production credential from a development key.
  const environment = env.DEPLOY_ENV;
  if (!DEPLOYED_ENVIRONMENTS.includes(environment ?? "")) {
    err.write(
      `DEPLOY_ENV is ${environment === undefined || environment === "" ? "unset" : `"${environment}"`}; ` +
        `expected one of ${DEPLOYED_ENVIRONMENTS.join(", ")}.\n` +
        "This token is only ever minted for a deployed Worker, and DEPLOY_ENV " +
        "is what selects the env file the signing key is read from -- an " +
        "unset value would sign a production credential with the development " +
        "key. Run this inside the deploy's own `with-env -c '...'` string.\n",
    );
    return 1;
  }

  let token;
  try {
    token = mintSandboxToken({
      signingKey: env.SUPABASE_JWT_SIGNING_KEY,
      projectRef: env.PROJECT_REF,
    });
  } catch (cause) {
    if (cause instanceof MintError) {
      err.write(`${cause.message}\n`);
      return 1;
    }
    throw cause;
  }

  // The only write to stdout in this file, and it happens after every check.
  out.write(`${token}\n`);
  return 0;
}

// Only when executed, never when imported by a test.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}
