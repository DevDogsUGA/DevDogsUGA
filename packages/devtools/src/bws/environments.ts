/**
 * The environments whose secrets live in Bitwarden, and which project backs each.
 *
 * **Bitwarden is the source of truth, and CI never reads it.** Values are
 * curated here, pulled to a local file, and pushed into GitHub environment
 * secrets (`pnpm devtools gh push`). Deploy jobs then read `${{ secrets.* }}`
 * like any other workflow.
 *
 * That one decision sets the whole budget. Because nothing machine-shaped ever
 * authenticates to Secrets Manager, there are **no CI machine accounts** — just
 * one `admin` account, held by a person, read/write on all three projects:
 *
 *   | Used | Free plan |
 *   |------|-----------|
 *   | 3 projects — dry-run, staging, production | 3 |
 *   | 1 machine account — `admin` | 3 |
 *
 * Two machine accounts spare, where the previous shape had none and could not
 * afford a project for `dry-run`.
 *
 * What the sync costs is a second copy that cannot be read back: GitHub secrets
 * are write-only, so `gh status` compares names and `updatedAt` against each
 * secret's `revisionDate` here. That catches the realistic failure — a rotation
 * pushed to Bitwarden and never propagated — without ever comparing values.
 *
 * What it buys: no `bws` binary and no Bitwarden network call in the deploy
 * path, and `${{ secrets.* }}` is masked in workflow logs automatically, which
 * a value pulled at run time is not unless somebody remembers `::add-mask::`.
 */

export const ENVIRONMENTS = ["dry-run", "staging", "production"] as const;
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
  "dry-run": {
    project: "devdogs-dry-run",
    file: ".env.dry-run",
    guarded: false,
    summary:
      "Credentials for the dry runs that precede a promotion to production. " +
      "Read-only by construction: a Postgres role that can see only the " +
      "migrations table, and an Airtable PAT with schema:read and nothing else.",
  },
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
 * Credentials that may reach the `production-apply` GitHub environment ONLY.
 *
 * Both are write-capable: `AIRTABLE_APPLY_PAT` can reshape the base, and a
 * Supabase access token carries full account privileges across both Supabase
 * organizations, which is what `supabase config push` needs and the one
 * mutation with no dry run.
 *
 * ⚠️ **This is a routing rule for `gh push`, not a Bitwarden one.** It moved
 * when CI stopped reading Bitwarden. The BWS `production` project may hold
 * these — only a person can read it, so one project per environment stays the
 * simplest thing to rotate. What must not happen is them landing in the
 * `production` *GitHub* environment, which deploys with no reviewer in front of
 * it; there they would make the `production-apply` gate decorative.
 *
 * So `gh push --env production` refuses them and `gh push --env production-apply`
 * accepts nothing else.
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
