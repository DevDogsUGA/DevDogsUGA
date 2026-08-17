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
   * This is the only scope `env push` sends anywhere.
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
 * what lets `env audit` compare them at all.
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
   * Whatever the targets no app boots from — today, `preflight` alone — hold
   * under this key name is narrow enough for a dry run and no wider.
   *
   * The opt-in that decides which keys a CI-only target carries, and it has to
   * live on the KEY rather than in the target table: nothing in a row about
   * `.env.preflight` can say *which* keys belong in it, and a hand-written list
   * in that row would be precisely the array this registry exists to delete.
   * The target half of the rule is derived instead — see
   * `holdsOnlyNarrowedKeys()` in `targets.ts`.
   *
   * ⚠️ THREE SHAPES SATISFY IT, and the difference decides how you check a
   * fourth before marking it. The field says nothing about which shape a key is
   * — it says only that the claim below holds — so reading it as one shape and
   * marking a key of another is how the wrong credential gets in.
   *
   *   * **The same key name, carrying a weaker credential here.** `DB_URL` is
   *     a full connection string in `.env`, `.env.staging` and
   *     `.env.production`; its preflight value is a Postgres role that can see
   *     `supabase_migrations.schema_migrations` and nothing else. Same key,
   *     same schema, a value deliberately weaker than the deployed one — which
   *     is exactly what one vault project per target already makes possible.
   *     Marking one of these is a claim about a value that has to be minted
   *     and pushed separately, and nothing in this repository can check it.
   *   * **A key that is only ever the narrow one.** `AIRTABLE_PLAN_PAT` holds
   *     a PAT with `schema.bases:read` on the officers' base and nothing else;
   *     there is no wider credential under that name in any target, because
   *     the wider Airtable tokens are separate declarations
   *     (`AIRTABLE_PAT`, `AIRTABLE_APPLY_PAT`). Here the narrowness is a
   *     property of the key rather than of one target's copy of it, so the
   *     claim is checked when the token is minted and cannot drift per target.
   *   * **A key that is not a credential at all.** `AIRTABLE_BASE_ID` is a
   *     public identifier (`secrecy: "public"`, so it is a GitHub *variable*
   *     that anyone who can read the repository's Actions config can read
   *     anyway). It names WHICH base the dry run talks to and confers no access
   *     to it; every capability in `deploy airtable-plan` comes from
   *     `AIRTABLE_PLAN_PAT` beside it. Here the promise holds trivially rather
   *     than by scoping — there is nothing under this name that could do more.
   *
   *     ⚠️ Added 2026-08-17, and it is the shape most easily over-applied.
   *     "Public" is not the test; "confers nothing" is. A public value that
   *     names a resource the preflight tier should not be able to REACH still
   *     widens what a dry run can do, and `secrecy: "public"` says nothing
   *     about that. If reading the value teaches an attacker where to point a
   *     credential they already hold, it is a shape-one question, not this one.
   *
   * All three make the same promise and it is the promise, not the shape,
   * that this field asserts: what `preflight` holds under this name cannot do
   * more than the dry runs need.
   *
   * ⚠️ ABSENT MEANS "NOT IN PREFLIGHT", and that default is the whole security
   * property. Without this field `keysRoutedTo("preflight")` answered with all
   * 45 routable keys, so `env push --target preflight` on a filled-in file
   * uploaded `SUPABASE_JWT_SIGNING_KEY` — which mints a token for ANY role,
   * `service_role` included — along with `SECRET_KEY` and
   * `GITHUB_APP_PRIVATE_KEY` into `devdogs-preflight`, whose GitHub environment
   * is reachable from `main`. §3.5 of the security plan refuses even a general
   * read-only Postgres role at that tier, on the grounds that it "would read all
   * production data from the `main` trust tier"; a signing key is considerably
   * worse.
   *
   * ⚠️ NOT a claim that the value is harmless, in any shape. Each has its
   * own way of being marked wrongly:
   *
   *   * shared-name — marking a key whose ONLY credential is the deployed one
   *     hands that credential to `main`, which is the bug this field was added
   *     to close, reintroduced one field later;
   *   * narrow-key — marking a key that is narrow by habit rather than by
   *     scope. `AIRTABLE_PLAN_PAT` qualifies because a token minted with
   *     `schema.bases:read` alone cannot be talked into a write; a key that
   *     merely *happens* to hold a limited token today does not;
   *   * non-credential — reading `secrecy: "public"` as the test and marking
   *     every public key. Most of them are not needed by a dry run at all, and
   *     `narrowed` is an opt-in to a TIER, not a secrecy restatement: the
   *     question is whether a preflight job would fail without it.
   */
  narrowed?: true;
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
   * SIGNED at deploy time rather than stored anywhere, so no copy of the value
   * exists to push, pull, or compare.
   *
   * The distinction `secrecy` cannot express. `secrecy` answers "where may this
   * be stored", and every answer it has — including `never-store` — presumes
   * there is a value somebody holds. A minted credential has no such value:
   * `SANDBOX_PROXY_TOKEN` is a JWT the deploy signs from
   * `SUPABASE_JWT_SIGNING_KEY` seconds before writing it to the Worker, and the
   * previous one is replaced on every deploy. It is a genuine secret
   * (`secrecy: "secret"`), it genuinely differs per deployment
   * (`scope: "environment"`), and it is genuinely absent from `.env`, Bitwarden
   * and GitHub — none of which is a mistake.
   *
   * ⚠️ Marking it is not bookkeeping; two tools fail in opposite directions
   * without it, and both failures are silent:
   *
   *   * `env audit` reports every Worker secret absent from Bitwarden as an
   *     ORPHAN, and the §3.6 prune path deletes orphans. Unmarked, the audit
   *     would recommend deleting the live proxy credential.
   *   * classifying it `never-store` instead — the intuitive reach, since it is
   *     never stored — inverts that into an ERROR saying it must be deleted
   *     from the Worker, which is the one place it has to be.
   *
   * Implies "not storable": `storableKeys()` excludes these, so `env push`
   * cannot upload one even if a value somehow lands in a local `.env`.
   */
  minted?: true;
  /**
   * The literal text `env example` and `env init` write after the `=`
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
