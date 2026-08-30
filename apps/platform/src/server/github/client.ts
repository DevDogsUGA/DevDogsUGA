/**
 * Authenticating to GitHub as the DevDogs App, not as a person.
 *
 * Every call this platform makes to GitHub is an **organization
 * administration** action: creating teams, granting repository access, writing
 * rulesets, inviting and removing members. Those need org-owner reach, and the
 * old shape got it from one classic `ghp_` token belonging to an org owner, so
 * a compromise of this Worker was an organization takeover: every repository,
 * every setting, every member, and any *other* organization that owner
 * belonged to.
 *
 * A GitHub App limits the damage rather than the likelihood:
 *
 *   * Its permissions are declared and fixed. `members: write` and
 *     `administration: write` on one installation is a long way from "whatever
 *     this human can do", and nothing can widen it at run time.
 *   * Installation tokens **expire after an hour**, so a leaked one is a
 *     one-hour problem. A `ghp_` token is valid until somebody revokes it.
 *   * It is not a person. Nobody graduates, and revoking it does not depend on
 *     remembering which officer's account the club was relying on.
 *
 * Protect the private key like a root credential: it can mint installation
 * tokens indefinitely. It lives in the `production` Bitwarden project and
 * reaches the Worker as a secret, and it is a multi-line PEM, the case the
 * `.env` tooling round-trips explicitly rather than treating newlines as
 * cosmetic.
 */
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { env } from "~/env";

let client: Octokit | null = null;

/**
 * An Octokit that authenticates as the installation.
 *
 * Built once. `@octokit/auth-app` caches the installation token internally and
 * refreshes it before expiry, so this is not a per-call cost. Creating a second
 * one would mint a second token on every request.
 */
export function octokit(): Octokit {
  client ??= new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.GH_APP_ID,
      privateKey: env.GH_APP_PRIVATE_KEY,
      installationId: env.GH_APP_INSTALLATION_ID,
    },
  });
  return client;
}

/**
 * A raw installation token, for the two calls that use `fetch` rather than
 * Octokit.
 *
 * Deliberately goes through the same Octokit instance rather than minting its
 * own: `auth({ type: "installation" })` returns the cached token and refreshes
 * it on the same schedule. A second auth strategy would mean a second token and
 * a second expiry to keep straight.
 *
 * ⚠️ Short-lived, and must not be stored, logged, or returned to a caller
 * outside this module's own requests.
 */
export async function installationToken(): Promise<string> {
  const auth = (await octokit().auth({ type: "installation" })) as {
    token: string;
  };
  return auth.token;
}
