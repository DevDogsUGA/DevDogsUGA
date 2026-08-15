/**
 * What every environment variable has to declare about itself.
 *
 * The problem this exists to solve: adding a variable used to mean editing four
 * files — the app's `env.ts`, `.env`, `.env.example`, and
 * `devtools/src/bws/environments.ts` — and only the first of those failed
 * loudly when you forgot. Miss the last one and the variable is simply absent
 * from every deployed environment, discovered at the next deploy.
 *
 * The fix is not "remember to edit four files". It is that three of the four
 * are DERIVED from the one you cannot skip, because the app will not boot
 * without it.
 *
 * ⚠️ The enforcement lives in `define()`'s signature, not here and not in zod's
 * `GlobalMeta`. Calling `.meta()` is optional in zod — a schema without it is
 * perfectly valid — so a registry that merely *reads* metadata cannot make
 * anyone write it. A wrapper whose second argument is required can.
 */

/**
 * Where a variable's value comes from, which is the same question as who is
 * responsible when it is wrong.
 */
export type EnvScope =
  /**
   * Differs per deployment and must be supplied. `.env`, `.env.staging` and
   * `.env.production` each carry their own value, and the deployed ones are
   * pushed to Bitwarden and GitHub.
   *
   * This is the only scope `secrets push` sends anywhere.
   */
  | "environment"
  /**
   * The same everywhere, and committed. `NEXT_PUBLIC_AVATARS_BUCKET` is a
   * bucket name; `GITHUB_COMPETITION_REPO` is this repository. A value in
   * Bitwarden that is also in `wrangler.jsonc` has two sources of truth, and
   * the one that loses is whichever the reader did not check.
   */
  | "default"
  /**
   * Set by a contributor on their own machine, for their own reasons, and
   * meaningless to anyone else. `DEV_VPN_HOST` is one machine's IP.
   *
   * Never pushed, never in `.env.example` as anything but a comment, and never
   * required — an app that cannot boot without one of these cannot boot in CI.
   */
  | "developer";

/**
 * How sensitive the value is, which decides where it may be *stored* rather
 * than where it comes from.
 */
export type EnvSecrecy =
  /** Not a secret. Safe in a log, a build artifact, or a committed file. */
  | "public"
  /** A secret. Bitwarden and GitHub Actions secrets only. */
  | "secret"
  /**
   * A secret that must never be stored anywhere but the operator's own vault —
   * not Bitwarden, not GitHub, not `.env.example`.
   *
   * Not "less sensitive than `secret`". The opposite: `BWS_ACCESS_TOKEN`
   * unlocks every Bitwarden project, so storing it in one is a key locked
   * inside the box it opens, and syncing it to GitHub would hand CI every
   * secret we hold.
   */
  | "never-store";

/**
 * Which GitHub environment a deployed secret may reach.
 *
 * `apply` is for credentials that can reshape production and have no dry run —
 * a Supabase access token carries full account privileges, and
 * `AIRTABLE_APPLY_PAT` can restructure the officers' base. They belong behind
 * required reviewers, not in the environment an ordinary deploy reads.
 *
 * ⚠️ A GitHub routing rule, not a Bitwarden one. The `production` Bitwarden
 * project does hold these: only a person can read it, one project per
 * environment stays the simplest thing to rotate, and holding them there is
 * what lets `secrets audit` compare them at all.
 */
export type EnvTier = "plan" | "apply";

/**
 * A type alias rather than an `interface`, and it has to be.
 *
 * zod's `GlobalMeta` carries `[x: string]: unknown`, and TypeScript gives
 * *implicit* index signatures to type aliases but not to interfaces — so an
 * `interface EnvMeta` is not assignable to it, and `.meta()` rejects it with
 * "Index signature for type 'string' is missing".
 */
export type EnvMeta = {
  /**
   * What the variable is for, and — more useful — what breaks when it is
   * missing or wrong. This is what lands in `.env.example`, so it is the only
   * documentation most readers will ever see.
   */
  doc: string;
  scope: EnvScope;
  secrecy: EnvSecrecy;
  /** Deployed-secret routing. Defaults to `plan` when absent. */
  tier?: EnvTier;
  /**
   * Supplied by `supabase status` when the local stack is running, so it is
   * absent from `.env` by design rather than by oversight.
   *
   * Marks the variables that make `.env.example` confusing: a contributor sees
   * `DB_URL` with no value and adds one by hand, which then wins over the
   * generated file forever.
   */
  localStack?: boolean;
  /**
   * The literal text `secrets example` and `secrets init` write after the `=`
   * — `"$API_URL"`, `"https://$PROJECT_REF.supabase.co"`,
   * `"http://localhost:3000"`, the committed Discord guild id. Absent means
   * the line ships empty: `KEY=""`.
   *
   * Structure, not a placeholder: a `$VAR` derivation is how the value is
   * actually built (dotenvx expands it), a localhost URL is the working
   * development default, and losing either turns a fill-in-the-blanks file
   * into a blank page. Values with no structure worth keeping stay absent.
   */
  example?: string;
  /**
   * The key ships commented out: `# KEY=""` rather than `KEY=""`.
   *
   * Encodes a real semantic, not tidiness: an EMPTY value for an enabled
   * OAuth provider makes the Supabase CLI fail with `ProjectConfigParseError`
   * — for those keys "unset" and "empty" are different states, and only the
   * commented form is safe to ship. Also used for keys most contributors
   * never set (operator credentials, opt-in overrides), where an uncommented
   * empty line would read as a blank to fill in.
   */
  commented?: true;
};

/**
 * Registered under zod's global metadata namespace, so `.meta()` accepts these
 * fields anywhere in the repository and a typo in one is a type error.
 *
 * Deliberately declared with EVERY FIELD OPTIONAL. Making them required here
 * would apply to every `.meta()` call in the monorepo, including ones that have
 * nothing to do with environment variables — zod's `GlobalMeta` is global in
 * the literal sense. Requiring them is `define()`'s job, where the scope is
 * exactly right.
 */
declare module "zod" {
  interface GlobalMeta extends Partial<EnvMeta> {}
}
