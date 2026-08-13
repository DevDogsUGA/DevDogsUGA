/**
 * The environments whose secrets live in Bitwarden, and which project backs each.
 *
 * TWO projects, not three, and the reason is the machine account budget rather
 * than tidiness. The free plan allows 3 projects, 3 machine accounts and 2
 * users. Spending a project on `dry-run` also spent the third machine account,
 * which left no account able to WRITE — and `bws` has no user authentication at
 * all, so there is no "just log in as yourself" alternative. The only way to
 * push was to temporarily grant write to a CI account and remember to take it
 * back, which is a revocation somebody eventually forgets.
 *
 * Dropping the `dry-run` project buys that slot back:
 *
 *   | Machine account | Projects              | Permission | Token lives          |
 *   |-----------------|-----------------------|------------|----------------------|
 *   | staging         | devdogs-staging       | read       | GitHub env `staging` |
 *   | production      | devdogs-production    | read       | GitHub `production`  |
 *   | admin           | BOTH                  | read/write | a human's vault      |
 *
 * The admin account is what these commands use. It never goes in GitHub — CI
 * stays read-only and single-project, so the blast radius of a CI compromise is
 * unchanged while the write path stops depending on anyone's memory.
 *
 * `dry-run`'s two credentials are GitHub environment secrets instead. They are
 * read-only by construction (a Postgres role that sees one table; a PAT with
 * `schema.bases:read`), which is what makes them cheap enough to hold that way.
 *
 * `production-apply` is a GitHub environment but not a third project: it runs
 * the same deploy against the same values behind required reviewers, so it
 * reuses `production`'s machine account. See `APPLY_ONLY_KEYS` for the two
 * credentials that must not be shared that way.
 */

export const ENVIRONMENTS = ["staging", "production"] as const;
export type BwsEnvironment = (typeof ENVIRONMENTS)[number];

export function isEnvironment(value: string): value is BwsEnvironment {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

export interface EnvironmentSpec {
  /** BWS project name. Resolved to a UUID at run time, never committed. */
  project: string;
  /** Local file `pull` writes and `push` reads by default. */
  file: string;
  /** Extra confirmation before writing. */
  guarded: boolean;
  summary: string;
}

/**
 * Project *names*, not ids.
 *
 * A project id is a UUID that means nothing without a token, so committing one
 * would leak nothing — but it would rot. Ids change when a project is recreated
 * (which is exactly what happens after a botched rotation), and a stale id fails
 * as "project not found" rather than as anything actionable. Resolving by name
 * costs one API call and cannot go stale silently.
 *
 * The file names are deliberately NOT `.env`. Pulling production over the file
 * `pnpm dev` reads is a foot-gun with no undo, and `.gitignore` already covers
 * `.env*` so these are equally safe from being committed.
 */
export const ENVIRONMENT_SPECS: Record<BwsEnvironment, EnvironmentSpec> = {
  staging: {
    project: "devdogs-staging",
    file: ".env.staging",
    guarded: false,
    summary: "Everything the two Next apps consume, pointed at staging.",
  },
  production: {
    project: "devdogs-production",
    file: ".env.production",
    guarded: true,
    summary:
      "The live values. Shared with the production-apply environment, which " +
      "is the same project behind required reviewers.",
  },
};

/**
 * Credentials that must NOT live in the shared `production` project.
 *
 * `production` (deploy) and `production-apply` (migrations, gated on reviewers)
 * reuse one machine account, because a fourth project would exceed the free
 * tier. That is fine for every value both jobs need and wrong for the one that
 * separates them: if the write-capable Airtable token sat in the project, the
 * ordinary deploy could read it and the reviewer gate would be decorative.
 *
 * So it stays a GitHub *environment secret* on `production-apply` alone, where
 * the branch policy and the required reviewers are what gate it. `push` refuses
 * to upload these, rather than trusting anyone to remember.
 */
export const APPLY_ONLY_KEYS = [
  "AIRTABLE_APPLY_PAT",
  // Same property, same reasoning. A Supabase personal access token "carries
  // the same privileges as your user account" -- there is no org- or
  // project-scoped CLI token -- so it reaches BOTH Supabase organizations.
  // `supabase config push` is the only command that needs one, it is the one
  // command with no dry run, and it carries `site_url` and every OAuth
  // provider. It belongs behind the reviewers, not in the project the ordinary
  // deploy can read.
  "SUPABASE_ACCESS_TOKEN",
] as const;

/**
 * Keys that are never secrets and must not be pushed.
 *
 * Each of these is either committed (identical everywhere) or a GitHub
 * environment *variable* (differs per environment, and deliberately visible in
 * logs). A value in BWS that is also in `wrangler.jsonc` is a value with two
 * sources of truth, and the one that loses is whichever the reader did not
 * check.
 */
export const NEVER_SECRET_KEYS = [
  "DEPLOY_ENV",
  "BASE_URL",
  "SCHEDULE_BUILDER_URL",
  "PROJECT_REF",
  "PUBLISHABLE_KEY",
  "AIRTABLE_BASE_ID",
  // A Discord channel id is not a secret, and it differs per environment --
  // production posts, everything else stays empty. Empty is also unpushable
  // (see the rejection below), so BWS could not hold the staging value even if
  // it were the right home for it.
  "DISCORD_ALERT_CHANNEL_ID",
  "NEXT_PUBLIC_AUTH_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_AVATARS_BUCKET",
  "NEXT_PUBLIC_FEEDBACK_BUCKET",
  "SKIP_ENV_VALIDATION",
] as const;
